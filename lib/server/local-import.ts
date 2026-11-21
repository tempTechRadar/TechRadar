// 내 컴퓨터 목록 가져오기 저장(PRD-F33, SPEC-6.2, IA-22). 주인: 차세일(C).
// 사용자 본인 로그인으로만 쓴다(서비스 키 없음, RLS가 본인 것만 허용, 불변 5).
// 붙여 넣은 글은 서버에서 다시 읽는다(화면의 미리보기를 믿지 않음). 저장은 한 번의 insert라 실패하면 아무것도 바뀌지 않는다(불변 4).
import type { SupabaseClient } from "@supabase/supabase-js";
import { npmKey, pypiKey } from "../domain/tech-key.ts";
import { parseImportLines, type ParseResult } from "../install/parse-import-lines.ts";
import type { InstallItem } from "../install/types.ts";
import { logIfError } from "./log-failure.ts";

export const LOCAL_PROJECT_NAME = "내 컴퓨터(프로젝트 밖)";

export type ImportOutcome =
  | { ok: true; saved: number; alreadyThere: number; skipped: ParseResult["skipped"]; secretLines: number[] }
  | { ok: false; message: string; skipped: ParseResult["skipped"]; secretLines: number[] };

/** 패키지는 기술 키로 카탈로그와 잇고, 스킬은 키를 만들 수 없어 이름만 남긴다 */
export function techKeyOf(item: InstallItem): string | null {
  if (item.kind === "skill") return null;
  if (item.ecosystem === "npm") return npmKey(item.pkg).key;
  if (item.ecosystem === "pypi") return pypiKey(item.pkg).key;
  return null;
}

type Existing = { tech_id: string | null; manual_name: string | null };

/** 저장할 줄 고르기(순수): 이미 있는 것은 빼고, 같은 기술이 두 번이면 한 번만 */
export function planRows(items: InstallItem[], techIds: Map<string, string>, existing: Existing[], ids: { userId: string; projectId: string }) {
  const haveTech = new Set(existing.map((e) => e.tech_id).filter(Boolean));
  const haveName = new Set(existing.map((e) => e.manual_name).filter(Boolean));
  const rows: Record<string, unknown>[] = [];
  let alreadyThere = 0;
  for (const item of items) {
    const key = techKeyOf(item);
    const techId = key ? techIds.get(key) ?? null : null;
    const manualName = techId ? null : item.name;
    if ((techId && haveTech.has(techId)) || (manualName && haveName.has(manualName))) { alreadyThere++; continue; }
    if (techId) haveTech.add(techId);
    else haveName.add(manualName!);
    rows.push({ owner_id: ids.userId, added_by: ids.userId, project_id: ids.projectId, tech_id: techId, manual_name: manualName, origin: "import", version: item.version ?? null });
  }
  return { rows, alreadyThere };
}

export async function localProjectId(db: SupabaseClient, userId: string): Promise<string> {
  const found = await db.from("projects").select("id").eq("owner_id", userId).eq("kind", "local").maybeSingle();
  if (found.error) throw new Error(`프로젝트 밖 칸을 읽지 못했어요: ${found.error.message}`);
  if (found.data) return found.data.id as string;
  const made = await db.from("projects").insert({ owner_id: userId, kind: "local", name: LOCAL_PROJECT_NAME }).select("id").single();
  if (made.error || !made.data) throw new Error(`프로젝트 밖 칸을 만들지 못했어요: ${made.error?.message ?? "빈 응답"}`);
  return made.data.id as string;
}

/** 폼 · 지도에서 고른 넣을 곳: "local"이면 프로젝트 밖 칸(처음 쓸 때 만듦), 아니면 받은 id 그대로(주인 확인은 addTech가) */
export const resolveProjectId = (db: SupabaseClient, userId: string, raw: string): Promise<string> =>
  raw === "local" ? localProjectId(db, userId) : Promise.resolve(raw);

async function lookups(db: SupabaseClient, items: InstallItem[], projectId: string) {
  const keys = [...new Set(items.map(techKeyOf).filter((k): k is string => k !== null))];
  const techs = keys.length ? await db.from("technologies").select("id, tech_key").in("tech_key", keys) : { data: [], error: null };
  if (techs.error) throw new Error(`기술 목록을 읽지 못했어요: ${techs.error.message}`);
  const existing = await db.from("my_technologies").select("tech_id, manual_name").eq("project_id", projectId);
  if (existing.error) throw new Error(`이미 있는 기술을 읽지 못했어요: ${existing.error.message}`);
  const techIds = new Map(((techs.data ?? []) as { id: string; tech_key: string }[]).map((t) => [t.tech_key, t.id]));
  return { techIds, existing: (existing.data ?? []) as Existing[] };
}

/** 가져오기 저장. 실패하면 이유를 돌려주고, 화면은 붙여 넣은 글을 그대로 둔다(다시 시도 가능). */
export async function saveLocalImport(db: SupabaseClient, userId: string, text: string): Promise<ImportOutcome> {
  const parsed = parseImportLines(text);
  const base = { skipped: parsed.skipped, secretLines: parsed.secretLines };
  if (parsed.items.length === 0) return { ok: false, message: "저장할 줄이 없어요(형식이 맞는 줄이 0개).", ...base };
  try {
    const projectId = await localProjectId(db, userId);
    const { techIds, existing } = await lookups(db, parsed.items, projectId);
    const { rows, alreadyThere } = planRows(parsed.items, techIds, existing, { userId, projectId });
    if (rows.length > 0) {
      const { error } = await db.from("my_technologies").insert(rows);
      if (error) throw new Error(`저장하지 못했어요(아무것도 바뀌지 않음): ${error.message}`);
    }
    // 누가·언제 넣었는지 남긴다(PRD-F33). 이 기록이 실패해도 저장한 목록은 그대로다
    logIfError("가져오기 기록(exports)을 남기지 못함", await db.from("exports").insert({ user_id: userId, kind: "local_import", tech_count: rows.length, imported_lines: parsed.items.length, rejected_lines: parsed.skipped.length + parsed.secretLines.length }));
    return { ok: true, saved: rows.length, alreadyThere, ...base };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), ...base };
  }
}
