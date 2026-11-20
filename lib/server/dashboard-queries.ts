// 대시보드가 쓰는 내 자료 읽기(IA-5). 주인: 황재웅(B). 로그인한 사용자의 클라이언트로 부른다(남의 줄은 RLS가 한 번 더 막는다, 불변 5).
// 읽기에 실패하면 던진다: 화면이 "데이터 없음"과 "조회 실패"를 다르게 보여 줘야 한다(PRD-F22).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertRecord } from "../alerts/to-alert-view.ts";
import { maskSecrets } from "../domain/redact.ts";
import { listMyAlerts } from "./alert-queries.ts";

export type DashboardData = {
  alerts: AlertRecord[];
  techs: { projectId: string | null }[];
  projects: { id: string; name: string }[];
};

type Row = Record<string, any>;
type DbResult = { data: unknown; error: { message: string } | null };

function rowsOrThrow({ data, error }: DbResult, what: string): Row[] {
  if (error || !data) throw new Error(`${what}: ${maskSecrets(error?.message ?? "빈 응답")}`);
  return data as Row[];
}

export async function readDashboardData(db: SupabaseClient, userId: string): Promise<DashboardData> {
  const [alerts, techs, projects] = await Promise.all([
    listMyAlerts(db, userId),
    // 보관한 프로젝트의 기술은 숫자에서 뺀다(PRD-F4, map-queries와 같은 조건)
    db.from("my_technologies").select("project_id, projects!inner(archived_at)").eq("owner_id", userId).is("hidden_at", null).is("projects.archived_at", null),
    db.from("projects").select("id, name").eq("owner_id", userId).is("archived_at", null).order("created_at"),
  ]);
  return {
    alerts,
    techs: rowsOrThrow(techs, "내 기술을 읽지 못함").map((row) => ({ projectId: row.project_id })),
    projects: rowsOrThrow(projects, "프로젝트를 읽지 못함").map((row) => ({ id: row.id, name: row.name })),
  };
}
