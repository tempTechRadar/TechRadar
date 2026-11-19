// 첫 점검 요약 띠(PRD-F14, UJ-A4, IA-10, SPEC-5.2 지도 띠): "첫 점검: 위험 n · 주의 n". DB·화면을 모르는 순수 함수.
// 건수는 첫 읽기 실행이 남긴 `grade` 단계의 branch_counts에서 읽는다(불변 6: 실행 기록이 근거). 읽지 못한 것은 0으로 단정하지 않는다(불변 2):
// 실패한 실행·읽은 기술이 0개인 실행은 띠를 만들지 않고, 일부만 읽은 실행·읽지 못한 기술은 띠에 안내를 덧붙인다.

export type FirstCheckStep = { stepName: string; branchCounts: Record<string, number> | null };
export type FirstCheckRun = { id: string; status: string; steps: FirstCheckStep[] };
export type FirstCheckBand = { runId: string; danger: number; caution: number; text: string; notes: string[] };

/** "한 번만" 보이게 하는 쿠키: 확인한 첫 읽기 실행 id들을 쉼표로 적는다. 기기마다 한 번이다(DB 칸은 없음, P-12a에서 정할 일) */
export const FIRST_CHECK_COOKIE = "first-check-seen";
export const FIRST_CHECK_COOKIE_OPTIONS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true } as const;
const MAX_SEEN = 10;

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 쿠키·폼에서 온 값은 실행 id(uuid) 모양일 때만 받는다 */
export const parseRunId = (raw: unknown): string | null => (typeof raw === "string" && RUN_ID.test(raw) ? raw : null);

export const parseSeenRunIds = (raw: string | undefined): string[] =>
  (raw ?? "").split(",").map(parseRunId).filter((id): id is string => id !== null);

/** 확인한 실행을 목록 끝에 더한다(앞의 것은 남김, 같은 것은 한 번, 최대 10개에서 오래된 것부터 밀려남) */
export const addSeenRunId = (raw: string | undefined, runId: string): string =>
  [...parseSeenRunIds(raw).filter((id) => id !== runId), runId].slice(-MAX_SEEN).join(",");

/** 숫자가 아니거나 음수인 값은 0 */
const count = (counts: Record<string, number> | null | undefined, key: string): number => {
  const value = counts?.[key];
  return Number.isFinite(value) && value! > 0 ? value! : 0; // Number.isFinite는 숫자가 아닌 값(문자열·undefined)을 false로 거른다
};

function bandOf(run: FirstCheckRun): FirstCheckBand | null {
  if (run.status !== "succeeded" && run.status !== "partial") return null; // 실패·아직 도는 실행의 건수는 믿지 않는다
  const grade = run.steps.find((step) => step.stepName === "grade");
  if (!grade?.branchCounts) return null;
  const graded = Object.keys(grade.branchCounts).reduce((sum, key) => sum + count(grade.branchCounts, key), 0);
  if (graded === 0) return null; // 읽은 기술이 없으면 "위험 0"이라고 말할 근거가 없다(저장소를 못 읽은 실행도 여기에 걸린다)
  const danger = count(grade.branchCounts, "danger");
  const caution = count(grade.branchCounts, "caution");
  const unread = count(run.steps.find((step) => step.stepName === "is_event")?.branchCounts, "collect_error");
  const notes = [
    ...(run.status === "partial" ? ["저장소 일부를 읽지 못해 이 숫자가 전부가 아닐 수 있어요"] : []),
    ...(unread > 0 ? [`읽지 못한 기술 ${unread}개는 이 숫자에서 빠졌어요`] : []),
  ];
  return { runId: run.id, danger, caution, text: `첫 점검: 위험 ${danger} · 주의 ${caution}`, notes };
}

/** 최근 첫 읽기 실행들(새것부터)에서 아직 확인하지 않은 첫 번째 띠. 없으면 null */
export function buildFirstCheckBand(runs: FirstCheckRun[], seenRunIds: string[]): FirstCheckBand | null {
  for (const run of runs) {
    if (seenRunIds.includes(run.id)) continue;
    const band = bandOf(run);
    if (band) return band;
  }
  return null;
}
