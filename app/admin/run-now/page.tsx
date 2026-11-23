// 관리자 "지금 한 번 실행"(P-17, IA-15 일부). 등록된 수집기, 3번 연속 수집 오류 출처 강조, 실행 버튼. 관리자만(불변 5).
// 11-23 리뉴얼: 관리자 틀(AdminShell) 안으로. 실행이 끝나면 서버 동작이 그 실행 id로 흐름 화면에 보낸다(actions.ts), 여기엔 가장 최근 "지금 실행"으로 가는 링크.
import Link from "next/link";
import { redirect } from "next/navigation";
import { SCHEDULE_COLLECTORS } from "@/lib/schedule/collectors";
import { readSourceHistory } from "@/lib/schedule/history";
import { HIGHLIGHT_AFTER, sourcesToHighlight } from "@/lib/schedule/retry";
import { getCurrentUser } from "@/lib/server/current-user";
import { SubmitButton } from "../submit-button";
import { getServerSupabase } from "@/lib/supabase/server";
import { AdminShell, when } from "../admin-shell";
import { runNowAction } from "./actions";
import { readFlash } from "@/lib/server/admin-flash";

// "지금 한 번 실행"이 수집기를 직접 돈다(묶음 예산 240초, P-9). 서버 액션은 이 화면의 시간 한도를 따르므로 cron 경로와 같이 Hobby 최대로 둔다.
export const maxDuration = 300;

const TITLE = "지금 한 번 실행";
const LEAD = "매일 06:00(한국 시간)에 저절로 도는 수집을 지금 한 번 돌려요. 출처 하나가 실패해도 나머지는 계속하고, 실패는 \"수집 오류\"로 남아요.";
const PROVES = "정기 실행과 같은 수집이 사람이 누를 때도 같은 기록(실행 · 단계 · 수집 오류)을 남긴다는 것";
const STATUS_KO: Record<string, string> = { queued: "대기", running: "실행 중", succeeded: "성공", failed: "실패", partial: "일부 실패" };

type LastRun = { id: string; status: string; created_at: string };

export default async function RunNowPage({ searchParams }: { searchParams: Promise<{ error?: string; info?: string; sig?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <AdminShell tab="run-now" title={TITLE} blocked="forbidden" />;
  const { error: errorParam, info: infoParam, sig } = await searchParams;
  const error = readFlash("error", errorParam, sig);
  const info = readFlash("info", infoParam, sig);
  const sources = SCHEDULE_COLLECTORS.map((c) => c.source);
  const db = await getServerSupabase();
  let highlight: string[] = [];
  let readError: string | null = null;
  let last: LastRun | null = null;
  try {
    highlight = db ? sourcesToHighlight(await readSourceHistory(db, sources)) : [];
    if (db) {
      const res = await db.from("runs").select("id, status, created_at").eq("trigger", "manual").order("created_at", { ascending: false }).limit(1);
      if (res.error) throw new Error(res.error.message);
      last = (res.data?.[0] as LastRun | undefined) ?? null;
    }
  } catch (e) {
    readError = e instanceof Error ? e.message : String(e);
  }

  return (
    <AdminShell tab="run-now" title={TITLE} lead={LEAD} proves={PROVES}>
      {error ? <p role="alert" className="admin-note danger">{error}</p> : null}
      {info ? <p role="status" className="admin-note info">{info}</p> : null}
      {readError ? <p role="alert" className="admin-note danger">최근 기록을 불러오지 못했어요(없는 게 아니에요): {readError}</p> : null}
      {highlight.length > 0 ? <p role="alert" className="admin-note danger">{HIGHLIGHT_AFTER}번 연속 수집 오류: {highlight.join(", ")}</p> : null}

      <form action={runNowAction} className="admin-actions">
        <SubmitButton label="지금 한 번 실행" pendingNote="최대 4분" className="primary" />
        <span className="muted">끝나면 그 실행의 흐름 화면으로 넘어가요.</span>
      </form>
      {last ? (
        <p className="admin-actions">
          <Link className="admin-linkbtn" href={`/admin/flow?run=${encodeURIComponent(last.id)}`}>가장 최근 지금 실행 흐름 보기</Link>
          <span className="muted">{when(last.created_at)} · {STATUS_KO[last.status] ?? last.status}</span>
        </p>
      ) : null}

      <h2>등록된 수집기 ({sources.length}개)</h2>
      {sources.length === 0 ? <p>아직 없어요. 수집 확장(P-9)이 합쳐지면 생겨요. 지금 누르면 실행 기록을 만들지 않고 이유만 알려 줘요.</p> : <ul className="admin-list">{sources.map((s) => <li key={s} className="mono">{s}</li>)}</ul>}
      <p className="muted">실패하면 다음 시도 시각(2분 뒤)을 실행 기록에 적기만 해요. 자동으로 다시 돌지는 않아요. 무료 플랜 예약은 하루 한 번이라 다시 돌리려면 이 버튼을 눌러요.</p>
    </AdminShell>
  );
}
