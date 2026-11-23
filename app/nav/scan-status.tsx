// 메뉴 오른쪽 상태 줄(P-12m B, 11-23 사용자 결정): LAST SCAN hh:mm │ ● 단계 m │ ● 수집 오류 k(실행 실패면 단계 점도 빨강).
// 값은 lib/server/scan-status(마지막 정기 수집의 runs · run_steps)에서만. 관리자는 눌러 그 실행의 흐름으로, 그 밖에는 읽기만(흐름 화면은 관리자 화면이라)
import { unstable_rethrow } from "next/navigation";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { kstTime, readScanStatus, type ScanStatus } from "@/lib/server/scan-status";

async function read(): Promise<ScanStatus> {
  try { return await readScanStatus(getServiceSupabase()); } catch (e) { unstable_rethrow(e); return { state: "fail" }; }
}

export async function ScanStatusLine({ admin }: { admin: boolean }) {
  const s = await read();
  const body = s.state === "ok" ? (
    <>
      <span className="scan-k">LAST SCAN</span> <time dateTime={s.at}>{kstTime(s.at)}</time>
      <span className="scan-sep" aria-hidden="true">│</span>
      <span><i className="scan-dot" data-tone={s.runFailed ? "err" : "ok"} aria-hidden="true" />단계 {s.steps}{s.runFailed ? " · 실행 실패" : ""}</span>
      <span className="scan-sep" aria-hidden="true">│</span>
      <span><i className="scan-dot" data-tone={s.errors ? "err" : "none"} aria-hidden="true" />수집 오류 {s.errors}</span>
    </>
  ) : <><span className="scan-k">LAST SCAN</span> {s.state === "none" ? "— 아직 없음" : "— 읽지 못함"}</>;
  const label = s.state === "ok" ? `마지막 정기 수집 ${kstTime(s.at)}${s.runFailed ? "(실행 실패)" : ""}, 단계 ${s.steps}개, 수집 오류 ${s.errors}개` : s.state === "none" ? "정기 수집 기록이 아직 없어요" : "수집 상태를 읽지 못했어요";
  return admin && s.state === "ok"
    ? <a className="scan-status" href={`/admin/flow?run=${s.runId}`} aria-label={`${label}. 흐름 보기`}>{body}</a>
    : <span className="scan-status" role="status" aria-label={label}>{body}</span>;
}
