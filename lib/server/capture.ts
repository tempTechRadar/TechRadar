// "+ 기술 넣기"(design.md 13절 5)의 찾기: 카탈로그에서 찾는다. 로그인한 사용자의 클라이언트로 부른다(내 표시는 본인 것만, 불변 5).
// 공개 목록에서 온 기술만(publicTechs, ADR 0029). 조회가 실패한 줄은 "찾지 못함"이 아니라 "조회 실패"(불변 2).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaptureLine } from "../capture/parse-capture.ts";
import type { Grade, MarkStatus } from "../map/build-map.ts";
import { searchTerm } from "../domain/my-tech-view.ts";
import { maskSecrets } from "../domain/redact.ts";
import { publicTechs } from "./map-queries.ts";

export type CaptureHit = { id: string; name: string; oneLiner: string | null; grade: Grade; mark: MarkStatus | null };
/** hits null = 조회 실패. 이름·키·저장소가 아닌 줄(영상 링크 등)은 찾지 않아 빈 배열 */
export type CaptureResult = { line: CaptureLine; hits: CaptureHit[] | null };
type Row = { id: string; display_name: string; one_liner: string | null; grade: Grade; tech_key: string; repo_url: string | null; depth: string };

const COLUMNS = "id, display_name, one_liner, grade, tech_key, repo_url, depth";
const PER_LINE = 3;
/** 사용자 글은 허용 글자만(searchTerm) 남기고, LIKE의 한 글자 자리표(_)는 글자 그대로 찾게 */
export const like = (s: string) => (searchTerm(s) ?? "").replace(/_/g, "\\_");
/** GitHub 저장소 주인·이름: GitHub가 허용하는 글자(영문·숫자·-·_·.)만, 한 글자 이름도 그대로 */
const repoPart = (s: string) => s.replace(/[^\w.-]/g, "").replace(/_/g, "\\_");
const logged = (what: string, message: string) => { console.error(what, maskSecrets(message)); return null; };

/** 이름 찾기 결과: 이름이 정확히 같은 것 → 그 이름으로 시작하는 것 → 두꺼운 것 → 이름순 */
function rankByName(rows: Row[], name: string): Row[] {
  const n = name.toLowerCase(), score = (r: Row) => (r.display_name.toLowerCase() === n ? 0 : r.display_name.toLowerCase().startsWith(n) ? 1 : 2);
  return [...rows].sort((a, b) => score(a) - score(b) || Number(a.depth !== "thick") - Number(b.depth !== "thick") || a.display_name.localeCompare(b.display_name));
}

async function rowsFor(db: SupabaseClient, line: CaptureLine, byKey: Map<string, Row[]> | null): Promise<Row[] | null> {
  if (line.kind === "key") return byKey ? byKey.get(line.key) ?? [] : null;
  if (line.kind === "repo") {
    const path = `github.com/${repoPart(line.owner)}/${repoPart(line.repo)}`; // 끝이 그대로 · .git · /하위 경로인 주소
    const { data, error } = await publicTechs(db, COLUMNS).or(`repo_url.ilike.*${path},repo_url.ilike.*${path}.git,repo_url.ilike.*${path}/*`).limit(PER_LINE);
    return error ? logged("기술 넣기 저장소 찾기 실패", error.message) : (data as unknown as Row[]);
  }
  if (line.kind === "name") {
    const term = like(line.name);
    if (!term) return [];
    const { data, error } = await publicTechs(db, COLUMNS).ilike("display_name", `%${term}%`).limit(30);
    return error ? logged("기술 넣기 이름 찾기 실패", error.message) : rankByName(data as unknown as Row[], line.name).slice(0, PER_LINE);
  }
  return [];
}

export async function lookupCapture(db: SupabaseClient, userId: string, lines: CaptureLine[]): Promise<CaptureResult[]> {
  // 키 줄은 한 번에(줄마다 질의를 보내지 않게)
  const keys = [...new Set(lines.flatMap((l) => (l.kind === "key" ? [l.key] : [])))];
  let byKey: Map<string, Row[]> | null = new Map();
  if (keys.length) {
    const { data, error } = await publicTechs(db, COLUMNS).in("tech_key", keys);
    if (error) byKey = logged("기술 넣기 키 찾기 실패", error.message);
    else for (const r of data as unknown as Row[]) byKey.set(r.tech_key, [...(byKey.get(r.tech_key) ?? []), r]);
  }
  const found = await Promise.all(lines.map(async (line) => ({ line, rows: await rowsFor(db, line, byKey) })));
  const ids = [...new Set(found.flatMap((f) => (f.rows ?? []).map((r) => r.id)))];
  const marks = new Map<string, MarkStatus>();
  if (ids.length) {
    const { data, error } = await db.from("tech_marks").select("tech_id, status").eq("user_id", userId).in("tech_id", ids);
    if (error) throw new Error(`내 판단 표시를 읽지 못함: ${maskSecrets(error.message)}`);
    for (const r of data ?? []) marks.set(r.tech_id as string, r.status as MarkStatus);
  }
  return found.map(({ line, rows }) => ({
    line, hits: rows === null ? null : rows.map((r) => ({ id: r.id, name: r.display_name, oneLiner: r.one_liner ?? null, grade: r.grade, mark: marks.get(r.id) ?? null })),
  }));
}
