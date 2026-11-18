// 실행 목록 한 줄(docs/flow.md 3절): 언제·무엇으로 시작·성공/실패·걸린 시간·처리 건수. 기록에 있는 값만 쓴다.
import { formatMs } from "./detail.ts";
import type { Flow, RunListRow } from "./types.ts";

export const RUN_STATUS: Record<RunListRow["status"], string> = {
  queued: "대기", running: "실행 중", succeeded: "성공", failed: "실패", partial: "일부 실패",
};

export type RunLine = { id: string; when: string; start: string; status: string; took: string; items: string };

/** 한국 시각, 24시간제(서버와 화면이 같은 글을 내도록 시간대를 정해 둔다) */
export function koreanTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

/** 끝난 실행만 걸린 시간을 계산한다. 아직 안 끝났으면 "진행 중", 시작 시각이 없으면 "기록 없음". */
export function took(run: Pick<RunListRow, "started_at" | "finished_at">): string {
  if (!run.started_at) return "기록 없음";
  if (!run.finished_at) return "진행 중";
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  return ms >= 0 ? formatMs(ms) : "기록 없음";
}

export function runLine(flow: Flow, run: RunListRow): RunLine {
  const start = flow.nodes.find((n) => n.type === "start" && n.run_trigger === run.trigger)?.name ?? run.trigger;
  return {
    id: run.id,
    when: koreanTime(run.started_at ?? run.created_at),
    start,
    status: RUN_STATUS[run.status] ?? run.status,
    took: took(run),
    items: `${run.item_count}건`,
  };
}

/** 사용자 화면(IA-11)에 보일 실행: 본인이 시작한 처음 읽기·다시 읽기만(RLS와 같은 조건을 화면에서도). */
export const USER_TRIGGERS = ["first_read", "user_reread"] as const;
export function isUserRun(run: { trigger: string; started_by?: string | null }, userId: string): boolean {
  return run.started_by === userId && (USER_TRIGGERS as readonly string[]).includes(run.trigger);
}
