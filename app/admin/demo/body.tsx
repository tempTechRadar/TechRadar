// 실패 시연과 채점 본문(관리자 화면 문법). 페이지(역할 확인 · 스위치 읽기)와 개발용 견본이 같이 쓴다.
// 버튼은 실제 경로(지금 실행 묶음 · 시뮬레이터 · 판단 저장의 실패 처리)를 탄다. 흐름 화면은 그 기록으로만 칠한다(불변 6). ①②⑤는 시연 스위치가 켜졌을 때만.
// 스위치가 꺼진 운영에서 대신 쓸 길(관리자 사용설명서 5-3: 깨진 시연 저장소 등록)을 섹션으로 보인다.
import { runSimulatorAction } from "../simulator/actions";
import { EvalPanel } from "./eval-panel";
import { SubmitButton } from "../submit-button";
import { AdminShell } from "../admin-shell";
import { AdminSection, AdminTile, AdminTiles, AdminToolbar } from "../admin-ui";
import { armSaveFailureAction, demoCollectErrorAction, demoNoChangeAction, disarmSaveFailureAction } from "./actions";

export const TITLE = "실패 시연과 채점";
const LEAD = "발표에서 성공·일부러 실패·지난 기록 찾기를 보여 주는 버튼이에요. 모두 실제 실행 기록을 남기고, 흐름 화면은 그 기록대로만 칠해져요. 만든 자료에는 가짜 표시가 붙고 시뮬레이터 지우기로 지워져요.";
const PROVES = "실패가 '변화 없음'으로 숨지 않고 수집 오류 · 저장 실패로 기록되며, 같은 일을 두 번 해도 사건이 두 번 생기지 않는다는 것";
const FAIL_REPO = "https://github.com/csaeil/techradar-fail-demo";
const TOOLBAR = { links: [{ href: "/admin/flow", label: "흐름 화면" }, { href: "/admin/simulator", label: "시뮬레이터" }] };

type Demo = { no: string; title: string; how: string; see: string; action: () => Promise<void>; label: string; needsSwitch: boolean };

const DEMOS: Demo[] = [
  { no: "①", title: "수집 오류", how: "OSV에 일부러 틀린 주소로 묻는 수집기 하나로 지금 실행을 돌려요.", see: "OSV 수집 상자가 빨강, 오류 종류는 '상태 코드', 수집 오류 갈래가 켜져요. 실행은 실패로 닫히고 다음 시도 시각이 적혀요.", action: demoCollectErrorAction, label: "수집 오류 시연", needsSwitch: true },
  { no: "②", title: "사건 아님", how: "OSV에서 같은 값(고친 버전)을 다시 읽어 직전 값과 비교해요. 두 번 누르세요.", see: "첫 번째는 '비교할 이전 값 없음', 두 번째부터 '변화 없음' 갈래 숫자만 늘고 알림은 없어요.", action: demoNoChangeAction, label: "같은 값 다시 읽기", needsSwitch: true },
  { no: "③", title: "중복", how: "시뮬레이터를 같은 시나리오로 두 번 눌러요.", see: "두 번째는 '변경 저장'이 '이미 있는 변경', 새 알림 0건이라 알림 상자는 초록이에요.", action: runSimulatorAction, label: "시뮬레이터 실행", needsSwitch: false },
  { no: "④", title: "판단 대기", how: "시뮬레이터로 가짜 취약점 1건을 만들어요(시연 계정이 그 기술을 쓰고 있어야 알림이 가요).", see: "사람 판단 상자가 주황 점선으로 멈춰요. 시연 계정이 판단하면 조치 상자가 켜져요.", action: runSimulatorAction, label: "시뮬레이터 실행", needsSwitch: false },
];

/** 스위치가 꺼진 운영 배포에서 실패 장면을 보이는 길(관리자 사용설명서 5-3). 링크만, 여기서 등록하지 않는다 */
function ProdFailGuide() {
  return (
    <AdminSection id="demo-prod" title="운영에서 실패 보여 주기(스위치 없이)"
      desc={<>스위치를 켜지 않고 <b>진짜로 깨진 입력</b>을 넣어요. 앱은 사용자가 깨진 파일을 올렸을 때와 똑같이 돌고, 흐름 화면은 그 실행 기록대로 칠해요.</>}>
      <ol className="admin-list">
        <li>프로젝트 보드의 &quot;+ 레포 등록&quot;에 깨진 시연 저장소 <span className="mono">{FAIL_REPO}</span>를 넣어요(이미 등록했으면 같은 주소로 다시 읽기).</li>
        <li>흐름 화면 실행 목록 맨 위의 &quot;처음 등록 읽기&quot;(또는 &quot;다시 읽기&quot;) · 실패 줄을 골라요.</li>
        <li>&quot;내 기술 뽑기&quot; 상자가 빨강이고, 누르면 오류 종류 &quot;응답 읽기 실패&quot;와 package.json 오류 글이 나와요. 변경 · 알림은 생기지 않아요.</li>
      </ol>
      <AdminToolbar links={[{ href: "/dashboard", label: "프로젝트 보드로" }, { href: "/admin/flow", label: "흐름 화면으로" }]} />
    </AdminSection>
  );
}

export function DemoBody({ on, error, info }: { on: boolean; error?: string; info?: string }) {
  return (
    <AdminShell tab="demo" title={TITLE} lead={LEAD} proves={PROVES} toolbar={TOOLBAR} notes={[
      { tone: on ? "success" : "warning", role: "status", text: `시연 스위치: ${on ? "켜짐(개발·시연 환경)" : "꺼짐 — 운영 배포이거나 ENABLE_FAIL_DEMO가 true가 아니에요. ①②⑤는 눌러도 아무 일도 없어요."}` },
      error ? { tone: "danger", text: error } : null,
      info ? { tone: "info", text: info } : null,
    ]}>
      {on ? null : <ProdFailGuide />}

      <AdminSection id="demo-buttons" title="실패 시연 단추" desc="단추마다 실제 실행 기록이 남아요. 누른 뒤 흐름 화면에서 그 실행을 골라 보여 줘요.">
        <AdminTiles>
          {DEMOS.map((d) => (
            <AdminTile key={d.no} id={`demo-${d.no}`} title={`${d.no} ${d.title}`}
              desc={<><p>{d.how}</p><p className="muted">보이는 것: {d.see}</p></>}>
              <form action={d.action}><SubmitButton label={d.label} disabled={d.needsSwitch && !on} /></form>
              {d.needsSwitch && !on ? <span className="muted">스위치가 꺼져 있어 못 눌러요</span> : null}
            </AdminTile>
          ))}
          <AdminTile id="demo-5" title="⑤ 저장 실패" desc={<>
            <p>켜면 <b>이 브라우저</b>에서 <b>시연 계정</b>의 다음 판단 저장 1번이 실패해요(10분 뒤 저절로 꺼짐). 관리자도 자기 알림은 판단할 수 있지만 남의 알림은 판단할 수 없어요(ADR 0016). 시연 알림은 시연 계정 것이니, 켠 뒤 같은 브라우저에서 시연 계정으로 로그인해 알림을 판단하세요.</p>
            <p className="muted">보이는 것: &quot;저장하지 못했어요&quot; 안내, 알림은 판단 대기 그대로, 흐름 화면의 조치 상자 빨강(조치 기록 연결 뒤).</p>
          </>}>
            <form action={armSaveFailureAction}><button type="submit" disabled={!on}>다음 저장 1번 실패시키기</button></form>
            <form action={disarmSaveFailureAction}><button type="submit" disabled={!on}>끄기</button></form>
          </AdminTile>
        </AdminTiles>
      </AdminSection>

      {on ? <ProdFailGuide /> : null}
      <EvalPanel />
    </AdminShell>
  );
}
