// 내 알림 읽기(IA-6·7). 주인: 황재웅(B). 로그인한 사용자의 클라이언트로 부른다(남의 줄은 RLS가 한 번 더 막는다, 불변 5).
// 읽기에 실패하면 던진다: 화면이 "알림 없음"과 "불러오지 못함"을 다르게 보여 줘야 한다(design.md).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertRecord } from "../alerts/to-alert-view.ts";
import { maskSecrets } from "../domain/redact.ts";

// 다대일 조인(changes, technologies, my_technologies, projects)은 실제 응답에서 한 줄 객체다(DB 타입 생성 전이라 느슨하게 둔다).
const COLUMNS =
  "id, kind, status, created_at, changes(kind, detected_at, prev_value, curr_value, technologies(display_name)), my_technologies(source_file, project_id, projects(name)), judgments(decision, reason, fixed_version, judged_at), comparison";

type Row = Record<string, any>;

// alert_id가 unique라 한 줄 객체로 오지만, 배열로 와도 첫 줄을 쓴다.
function toJudgment(raw: Row | Row[] | null | undefined): AlertRecord["judgment"] {
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row ? { decision: row.decision, reason: row.reason, fixedVersion: row.fixed_version, judgedAt: row.judged_at } : null;
}

// 예전 모양(표 5줄만 배열로 저장)이나 깨진 값은 null: 화면이 비교표 없이 보여 준다.
function toComparison(raw: unknown): AlertRecord["comparison"] {
  const value = raw as Row | null;
  const valid =
    value !== null && typeof value === "object" && !Array.isArray(value) &&
    typeof value.myTechName === "string" && typeof value.newTechName === "string" &&
    (value.confirmedAt === null || typeof value.confirmedAt === "string") && Array.isArray(value.rows);
  return valid ? { myTechName: value!.myTechName, newTechName: value!.newTechName, confirmedAt: value!.confirmedAt, rows: value!.rows } : null;
}

function toRecord(row: Row): AlertRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    projectId: row.my_technologies?.project_id ?? null,
    projectName: row.my_technologies?.projects?.name ?? null,
    sourceFile: row.my_technologies?.source_file ?? null,
    judgment: toJudgment(row.judgments),
    comparison: toComparison(row.comparison),
    change: {
      kind: row.changes.kind,
      techName: row.changes.technologies.display_name,
      detectedAt: row.changes.detected_at,
      prevValue: row.changes.prev_value,
      currValue: row.changes.curr_value,
    },
  };
}

/** 내 알림, 최신순. 없으면 빈 목록, 읽기에 실패하면 오류. */
export async function listMyAlerts(db: SupabaseClient, userId: string): Promise<AlertRecord[]> {
  const { data, error } = await db.from("alerts").select(COLUMNS).eq("user_id", userId).order("created_at", { ascending: false });
  if (error || !data) throw new Error(`알림을 읽지 못함: ${maskSecrets(error?.message ?? "빈 응답")}`);
  return (data as Row[]).map(toRecord);
}

/** 알림 한 건. 내 것이 아니거나 없으면 null, 읽기에 실패하면 오류. */
export async function getMyAlert(db: SupabaseClient, userId: string, alertId: string): Promise<AlertRecord | null> {
  const { data, error } = await db.from("alerts").select(COLUMNS).eq("user_id", userId).eq("id", alertId).maybeSingle();
  if (error) throw new Error(`알림을 읽지 못함: ${maskSecrets(error.message)}`);
  return data ? toRecord(data as Row) : null;
}
