// 관리자 "지금 한 번 실행"(P-17, IA-15 일부). 등록된 수집기, 3번 연속 수집 오류 출처 강조, 실행 버튼. 관리자만(불변 5).
import Link from "next/link";
import { redirect } from "next/navigation";
import { SCHEDULE_COLLECTORS } from "@/lib/schedule/collectors";
import { readSourceHistory } from "@/lib/schedule/history";
import { HIGHLIGHT_AFTER, sourcesToHighlight } from "@/lib/schedule/retry";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { runNowAction } from "./actions";
import { readFlash } from "@/lib/server/admin-flash";

// "지금 한 번 실행"이 수집기를 직접 돈다(묶음 예산 240초, P-9). 서버 액션은 이 화면의 시간 한도를 따르므로 cron 경로와 같이 Hobby 최대로 둔다.
export const maxDuration = 300;

export default async function RunNowPage({ searchParams }: { searchParams: Promise<{ error?: string; info?: string; sig?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <main><h1>지금 한 번 실행</h1><p>관리자만 쓸 수 있어요.</p></main>;
  const { error: errorParam, info: infoParam, sig } = await searchParams;
  const error = readFlash("error", errorParam, sig);
  const info = readFlash("info", infoParam, sig);
  const sources = SCHEDULE_COLLECTORS.map((c) => c.source);
  const db = await getServerSupabase();
  let highlight: string[] = [];
  let readError: string | null = null;
  try {
    highlight = db ? sourcesToHighlight(await readSourceHistory(db, sources)) : [];
  } catch (e) {
    readError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main>
      <p><Link href="/admin/flow">흐름 화면</Link></p>
      <h1>지금 한 번 실행</h1>
      <p>매일 06:00(한국 시간)에 저절로 도는 수집을 지금 한 번 돌려요. 출처 하나가 실패해도 나머지는 계속하고, 실패는 "수집 오류"로 남아요.</p>
      {error ? <p role="alert" style={{ color: "#b3261e" }}>{error}</p> : null}
      {info ? <p role="status">{info}</p> : null}
      {readError ? <p role="alert" style={{ color: "#b3261e" }}>최근 기록을 읽지 못했어요(없는 게 아니라 조회 실패): {readError}</p> : null}
      {highlight.length > 0 ? (
        <p role="alert" style={{ background: "#f7c6c1", padding: "8px 12px", borderRadius: 8 }}>
          {HIGHLIGHT_AFTER}번 연속 수집 오류: {highlight.join(", ")}
        </p>
      ) : null}
      <h2>등록된 수집기 ({sources.length}개)</h2>
      {sources.length === 0 ? <p>아직 없어요. 수집 확장(P-9)이 합쳐지면 생겨요. 지금 누르면 실행 기록을 만들지 않고 이유만 알려 줘요.</p> : <ul>{sources.map((s) => <li key={s}>{s}</li>)}</ul>}
      <form action={runNowAction}>
        <button type="submit" style={{ minHeight: 44 }}>지금 한 번 실행</button>
      </form>
      <p style={{ fontSize: 14, color: "#5b564c" }}>재시도: 실패하면 2·4·8분 뒤로 다음 시도 시각을 실행 기록에 적어요(최대 3번). 무료 플랜 예약은 하루 한 번이라 다시 돌리는 건 이 버튼으로 해요.</p>
    </main>
  );
}
