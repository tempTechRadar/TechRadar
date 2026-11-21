// 실패 시연 화면(P-20c, docs/flow.md 4절, PRD-F28·F29·F30). 관리자만(불변 5). ①②⑤는 시연 스위치가 켜졌을 때만.
// 버튼은 실제 경로(지금 실행 묶음·시뮬레이터·판단 저장의 실패 처리)를 탄다. 흐름 화면은 그 기록으로만 칠한다(불변 6).
import Link from "next/link";
import { redirect } from "next/navigation";
import { isDemoSwitchEnabled } from "@/lib/demo/demo-switch";
import { getCurrentUser } from "@/lib/server/current-user";
import { runSimulatorAction } from "../simulator/actions";
import { EvalPanel } from "./eval-panel";
import { armSaveFailureAction, demoCollectErrorAction, demoNoChangeAction, disarmSaveFailureAction } from "./actions";
import { readFlash } from "@/lib/server/admin-flash";

const btn = { minHeight: 44, padding: "0 16px" } as const;
const card = { border: "1px solid #e5e7eb", borderRadius: 6, padding: 16, marginBottom: 12 } as const;

type Demo = { no: string; title: string; how: string; see: string; action: () => Promise<void>; label: string; needsSwitch: boolean };

const DEMOS: Demo[] = [
  { no: "①", title: "수집 오류", how: "OSV에 일부러 틀린 주소로 묻는 수집기 하나로 지금 실행을 돌려요.", see: "OSV 수집 상자가 빨강, 오류 종류는 '상태 코드', 수집 오류 갈래가 켜져요. 실행은 실패로 닫히고 다음 시도 시각이 적혀요.", action: demoCollectErrorAction, label: "수집 오류 시연", needsSwitch: true },
  { no: "②", title: "사건 아님", how: "OSV에서 같은 값(고친 버전)을 다시 읽어 직전 값과 비교해요. 두 번 누르세요.", see: "첫 번째는 '비교할 이전 값 없음', 두 번째부터 '변화 없음' 갈래 숫자만 늘고 알림은 없어요.", action: demoNoChangeAction, label: "같은 값 다시 읽기", needsSwitch: true },
  { no: "③", title: "중복", how: "시뮬레이터를 같은 시나리오로 두 번 눌러요.", see: "두 번째는 '변경 저장'이 '이미 있는 변경', 새 알림 0건이라 알림 상자는 초록이에요.", action: runSimulatorAction, label: "시뮬레이터 실행", needsSwitch: false },
  { no: "④", title: "판단 대기", how: "시뮬레이터로 가짜 취약점 1건을 만들어요(시연 계정이 그 기술을 쓰고 있어야 알림이 가요).", see: "사람 판단 상자가 주황 점선으로 멈춰요. 시연 계정이 판단하면 조치 상자가 켜져요.", action: runSimulatorAction, label: "시뮬레이터 실행", needsSwitch: false },
];

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ error?: string; info?: string; sig?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <main><h1>실패 시연</h1><p>관리자만 쓸 수 있어요.</p></main>;
  const on = isDemoSwitchEnabled(process.env);
  const { error: errorParam, info: infoParam, sig } = await searchParams;
  const error = readFlash("error", errorParam, sig);
  const info = readFlash("info", infoParam, sig);

  return (
    <main style={{ maxWidth: 880 }}>
      <p><Link href="/admin/flow">흐름 화면</Link> · <Link href="/admin/simulator">시뮬레이터</Link></p>
      <h1>실패 시연</h1>
      <p>발표에서 성공·일부러 실패·지난 기록 찾기를 보여 주는 버튼이에요. 모두 실제 실행 기록을 남기고, 흐름 화면은 그 기록대로만 칠해져요. 만든 자료에는 가짜 표시가 붙고 시뮬레이터 지우기로 지워져요.</p>
      <p role="status" style={{ padding: "8px 12px", borderRadius: 6, background: on ? "var(--bg-pass)" : "var(--bg-caution)", color: on ? "var(--ink-pass)" : "var(--ink-caution)" }}>
        시연 스위치: {on ? "켜짐(개발·시연 환경)" : "꺼짐 — 운영 배포이거나 ENABLE_FAIL_DEMO가 true가 아니에요. ①②⑤는 눌러도 아무 일도 없어요."}
      </p>
      {error ? <p role="alert" style={{ color: "var(--ink-danger)" }}>{error}</p> : null}
      {info ? <p role="status">{info}</p> : null}

      {DEMOS.map((d) => (
        <section key={d.no} style={card} aria-labelledby={`demo-${d.no}`}>
          <h2 id={`demo-${d.no}`} style={{ fontSize: 20, margin: "0 0 4px" }}>{d.no} {d.title}</h2>
          <p style={{ margin: "4px 0" }}>{d.how}</p>
          <p style={{ margin: "4px 0", color: "var(--muted)" }}>보이는 것: {d.see}</p>
          <form action={d.action}>
            <button type="submit" style={btn} disabled={d.needsSwitch && !on}>{d.label}</button>
          </form>
        </section>
      ))}

      <section style={card} aria-labelledby="demo-5">
        <h2 id="demo-5" style={{ fontSize: 20, margin: "0 0 4px" }}>⑤ 저장 실패</h2>
        <p style={{ margin: "4px 0" }}>켜면 <b>이 브라우저</b>에서 <b>시연 계정</b>의 다음 판단 저장 1번이 실패해요(10분 뒤 저절로 꺼짐). 관리자도 자기 알림은 판단할 수 있지만 남의 알림은 판단할 수 없어요(ADR 0016). 시연 알림은 시연 계정 것이니, 켠 뒤 같은 브라우저에서 시연 계정으로 로그인해 알림을 판단하세요.</p>
        <p style={{ margin: "4px 0", color: "var(--muted)" }}>보이는 것: "저장하지 못했어요" 안내, 알림은 판단 대기 그대로, 흐름 화면의 조치 상자 빨강(조치 기록 연결 뒤).</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <form action={armSaveFailureAction}><button type="submit" style={btn} disabled={!on}>다음 저장 1번 실패시키기</button></form>
          <form action={disarmSaveFailureAction}><button type="submit" style={btn} disabled={!on}>끄기</button></form>
        </div>
      </section>

      <EvalPanel style={card} />
    </main>
  );
}
