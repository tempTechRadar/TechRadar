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

export async function readChange(db: SupabaseClient, changeId: string): Promise<Row> {
  const { data, error } = await db.from("changes").select("kind, dedupe_key, is_simulated").eq("id", changeId).single();
  if (error || !data) throw failure("변경을 읽지 못함", error?.message);
  return data as Row;
}

/** 이 기술들을 쓰는 줄(숨김·보관·시연 계정 여부와 등록 시각 포함) */
export async function readUsages(db: SupabaseClient, techIds: string[]): Promise<(TechUsage & { registeredAt: string })[]> {
  const mine = rowsOrThrow(await db.from("my_technologies").select("id, owner_id, tech_id, project_id, hidden_at, created_at").in("tech_id", techIds), "내 기술을 읽지 못함");
  const projects = rowsOrThrow(await db.from("projects").select("id, archived_at").in("id", mine.map((m) => m.project_id)), "프로젝트를 읽지 못함");
  const owners = rowsOrThrow(await db.from("profiles").select("id, is_demo").in("id", mine.map((m) => m.owner_id)), "사용자를 읽지 못함");
  return mine.map((m) => ({
    userId: m.owner_id,
    myTechnologyId: m.id,
    techId: m.tech_id,
    isDemo: owners.find((o) => o.id === m.owner_id)?.is_demo === true,
    hidden: m.hidden_at !== null,
    archived: projects.find((p) => p.id === m.project_id)?.archived_at !== null,
    registeredAt: m.created_at,
  }));
}

export async function readExistingAlertKeys(db: SupabaseClient, changeId: string): Promise<Set<string>> {
  const rows = rowsOrThrow(await db.from("alerts").select("dedupe_key").eq("change_id", changeId), "알림을 읽지 못함");
  return new Set(rows.map((row) => row.dedupe_key));
}

/** 알림 줄을 쓰고 새로 만들어진 개수를 돌려준다. (user_id, dedupe_key)가 같은 줄은 DB가 건너뛴다(불변 3). */
export async function writeAlerts(db: SupabaseClient, rows: Row[]): Promise<number> {
  const written = await db.from("alerts").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
  return rowsOrThrow(written, "알림을 저장하지 못함").length;
}
