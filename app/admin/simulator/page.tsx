// 시뮬레이터 화면(IA-16 아래). 버튼 한 번으로 가짜 변경 1건을 만들고, 가짜 표시 줄만 지운다. 관리자만(불변 5).
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/current-user";
import { clearSimulatedAction, runOpportunityAction, runSimulatorAction } from "./actions";
import { readFlash } from "@/lib/server/admin-flash";

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ error?: string; cleared?: string; info?: string; run?: string; sig?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <main><h1>시뮬레이터</h1><p>관리자만 쓸 수 있어요.</p></main>;
  const { error: errorParam, cleared: clearedParam, info: infoParam, run, sig } = await searchParams;
  const error = readFlash("error", errorParam, sig);
  const cleared = readFlash("cleared", clearedParam, sig);
  const info = readFlash("info", infoParam, sig);

  return (
    <main>
      <h1>시뮬레이터</h1>
      <p>진짜 취약점은 발표 시간에 맞춰 나오지 않아서, 가짜 변경 1건(npm mcp-remote 0.1.15, 위험)을 만들어 처음부터 끝까지 도는 걸 보여 줍니다.</p>
      <ul>
        <li>가짜 표시(시뮬레이터)가 붙은 줄만 만들고 지워요.</li>
        <li>알림은 시연 계정에만 가요. 그 계정이 이 기술을 쓰지 않으면 알림은 0건이고, 결과 화면에 이유가 나와요.</li>
        <li>같은 버튼을 또 눌러도 변경은 1건 그대로예요.</li>
      </ul>
      {error ? <p role="alert" style={{ color: "var(--ink-danger)" }}>{error}</p> : null}
      {cleared ? <p role="status">{cleared}</p> : null}
      {info ? <p role="status">{info}{run ? <> <Link href={`/admin/flow?run=${encodeURIComponent(run)}`}>방금 실행 보기</Link></> : null}</p> : null}
      <form action={runSimulatorAction} style={{ marginBottom: 16 }}>
        <button type="submit" style={{ minHeight: 44 }}>가짜 변경 1건 만들기</button>
      </form>
      <form action={runOpportunityAction} style={{ marginBottom: 16 }}>
        <p>적용 기회: 시연 계정이 쓰는 기술과 같은 역할로 확정된 가짜 새 기술 1개를 넣어 &quot;적용 기회&quot; 알림까지 보여 줘요(가짜 표시, 시연 계정에만).</p>
        <button type="submit" style={{ minHeight: 44 }}>적용 기회 1건 만들기</button>
      </form>
      <form action={clearSimulatedAction}>
        <p>지우기는 가짜 표시가 붙은 줄만 지우고, 실행 기록은 증거라 남겨요. 바꾼 기록(audit_logs)에 한 줄이 남습니다.</p>
        <button type="submit" style={{ minHeight: 44 }}>시뮬레이터 지우기</button>
      </form>
      <p><Link href="/admin/flow">흐름 화면으로</Link></p>
    </main>
  );
}
