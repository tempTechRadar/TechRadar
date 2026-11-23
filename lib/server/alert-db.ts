// 알림 만들기 두 경로(보안·적용 기회)가 같이 쓰는 읽기·쓰기. 주인: 황재웅(B). 서비스 키 클라이언트로 부른다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TechUsage } from "../alerts/decide-alerts.ts";
import { maskSecrets } from "../domain/redact.ts";

export type Row = Record<string, any>;
type DbResult = { data: unknown; error: { message: string } | null };

export const failure = (what: string, message?: string) => new Error(`${what}: ${maskSecrets(message ?? "빈 응답")}`);

export function rowsOrThrow({ data, error }: DbResult, what: string): Row[] {
  if (error || !data) throw failure(what, error?.message);
  return data as Row[];
}

const PAGE_SIZE = 1000; // DB 한 번 응답의 줄 수 한도
const IN_LIST_SIZE = 100; // .in() 목록이 길면 주소가 너무 길어 실패한다

/** 한도(1000줄)에서 잘리지 않게 쪽마다 이어서 읽는다 */
async function readAll(what: string, page: (from: number, to: number) => PromiseLike<DbResult>): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = rowsOrThrow(await page(from, from + PAGE_SIZE - 1), what);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}

/** 값 목록을 끊어서 .in()으로 읽는다(중복 값은 한 번만) */
async function readIn(what: string, values: string[], read: (chunk: string[]) => PromiseLike<DbResult>): Promise<Row[]> {
  const unique = [...new Set(values)];
  const rows: Row[] = [];
  for (let i = 0; i < unique.length; i += IN_LIST_SIZE) rows.push(...rowsOrThrow(await read(unique.slice(i, i + IN_LIST_SIZE)), what));
  return rows;
}

export async function readChange(db: SupabaseClient, changeId: string): Promise<Row> {
  const { data, error } = await db.from("changes").select("kind, dedupe_key, is_simulated, version").eq("id", changeId).single();
  if (error || !data) throw failure("변경을 읽지 못함", error?.message);
  return data as Row;
}

/** 이 기술들을 쓰는 줄(숨김·보관·시연 계정 여부와 등록 시각 포함) */
export async function readUsages(db: SupabaseClient, techIds: string[]): Promise<(TechUsage & { registeredAt: string; version: string | null })[]> {
  const mine = await readAll("사용 중인 항목을 읽지 못함", (from, to) =>
    db.from("my_technologies").select("id, owner_id, tech_id, project_id, version, hidden_at, created_at").in("tech_id", techIds).order("id").range(from, to));
  const projects = await readIn("프로젝트를 읽지 못함", mine.map((m) => m.project_id), (chunk) => db.from("projects").select("id, archived_at").in("id", chunk));
  const owners = await readIn("사용자를 읽지 못함", mine.map((m) => m.owner_id), (chunk) => db.from("profiles").select("id, is_demo").in("id", chunk));
  return mine.map((m) => ({
    userId: m.owner_id,
    myTechnologyId: m.id,
    techId: m.tech_id,
    isDemo: owners.find((o) => o.id === m.owner_id)?.is_demo === true,
    hidden: m.hidden_at !== null,
    archived: projects.find((p) => p.id === m.project_id)?.archived_at !== null,
    registeredAt: m.created_at,
    version: m.version ?? null,
  }));
}

export async function readExistingAlertKeys(db: SupabaseClient, changeId: string): Promise<Set<string>> {
  const rows = await readAll("알림을 읽지 못함", (from, to) => db.from("alerts").select("dedupe_key").eq("change_id", changeId).order("id").range(from, to));
  return new Set(rows.map((row) => row.dedupe_key));
}

/** 알림 줄을 쓰고 새로 만들어진 개수를 돌려준다. (user_id, dedupe_key)가 같은 줄은 DB가 건너뛴다(불변 3). */
export async function writeAlerts(db: SupabaseClient, rows: Row[]): Promise<number> {
  const written = await db.from("alerts").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
  return rowsOrThrow(written, "알림을 저장하지 못함").length;
}
