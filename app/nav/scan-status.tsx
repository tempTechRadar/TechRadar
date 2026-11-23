// 메뉴 오른쪽 상태 줄(P-12m B, P-12n 문구): 마지막 수집 hh:mm │ ● 출처 m │ ● 수집 오류 k(실행 실패면 출처 점도 빨강, 진행 중이면 그렇게). 지도 칩 "수집 오류 기술 n"과 뜻이 다르다(출처 단위).
// 값은 lib/server/scan-status(마지막 정기 수집의 runs · run_steps)에서만. 관리자는 눌러 그 실행의 흐름으로, 그 밖에는 읽기만(흐름 화면은 관리자 화면이라).
// 모든 화면의 메뉴에 붙으므로 5분 캐시(정기 수집은 하루 한 번, 자체 리뷰: 요청마다 DB 두 번)
import { unstable_cache } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { kstTime, readScanStatus, type ScanStatus } from "@/lib/server/scan-status";

const cached = unstable_cache(() => readScanStatus(getServiceSupabase()), ["scan-status"], { revalidate: 300 });
async function read(): Promise<ScanStatus> {
  try { return await cached(); } catch (e) { unstable_rethrow(e); return { state: "fail" }; }
}

export async function ScanStatusLine({ admin }: { admin: boolean }) {
  const s = await read();
  const body = s.state === "ok" ? (
    <>
      <span className="scan-k">마지막 수집</span> <time dateTime={s.at}>{kstTime(s.at)}</time>
      <span className="scan-sep" aria-hidden="true">│</span>
      <span className={s.runFailed || s.otherFailed ? "scan-errpart" : undefined}><i className="scan-dot" data-tone={s.runFailed || s.otherFailed ? "err" : s.running ? "none" : "ok"} aria-hidden="true" />출처 {s.sources}{s.runFailed ? " · 실행 실패" : s.otherFailed ? ` · 처리 실패 ${s.otherFailed}` : s.running ? " · 진행 중" : ""}</span>
      <span className="scan-sep" aria-hidden="true">│</span>
      <span className="scan-errpart"><i className="scan-dot" data-tone={s.errors ? "err" : "none"} aria-hidden="true" />수집 오류 {s.errors}</span>
    </>
  ) : <span className={s.state === "fail" ? "scan-errpart" : undefined}><span className="scan-k">마지막 수집</span> {s.state === "none" ? "— 아직 없음" : "— 읽지 못함"}</span>;
  const label = s.state === "ok" ? `마지막 정기 수집 ${kstTime(s.at)}${s.runFailed ? "(실행 실패)" : s.running ? "(진행 중)" : ""}, 출처 ${s.sources}곳, 출처 수집 오류 ${s.errors}건${s.otherFailed ? `, 처리 단계 실패 ${s.otherFailed}건` : ""}` : s.state === "none" ? "정기 수집 기록이 아직 없어요" : "수집 상태를 읽지 못했어요";
  // 좁은 화면에서는 줄을 숨기되 알릴 것(수집 오류 · 실행 실패 · 읽지 못함)이 있으면 그 부분만 남긴다(site-nav.css, 불변 2)
  const alert = s.state === "fail" || (s.state === "ok" && (s.errors > 0 || s.runFailed || s.otherFailed > 0)) ? "" : undefined;
  return admin && s.state === "ok"
    ? <a className="scan-status" data-err={alert} href={`/admin/flow?run=${s.runId}`} aria-label={`${label}. 흐름 보기`}>{body}</a>
    : <span className="scan-status" data-err={alert} role="status" aria-label={label}>{body}</span>;
}
