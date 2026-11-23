// 관리자 흐름 화면 본문(관리자 화면 문법). 값은 모두 페이지가 읽은 실제 runs · run_steps(불변 6). 견본은 가짜 실행을 넣는다.
// 못 읽음 · 못 찾음은 알림 자리에(불변 2: 회색 = "안 돎"으로 읽히지 않게 그림을 그리지 않음), 그림과 실행 목록은 각각 섹션.
import flowJson from "@/flow/flow.json";
import type { Flow, RunListRow, StepDetail } from "@/lib/flow/types";
import { AdminShell } from "../admin-shell";
import { AdminEmpty, AdminSection } from "../admin-ui";
import { RunDiagram, RunTable } from "./run-view";

const flow = flowJson as unknown as Flow;
export const TITLE = "흐름 화면";
const LEAD = "앱이 실제로 돈 기록대로 칠해져요. 기록이 없는 상자는 회색으로 남아요. 그림 바탕만 밝은 종이색인 것은 상자 색과 글자 대비를 이 바탕에 맞춰 둔 그대로라서예요(관측소 테마 때 그대로 둠).";
const PROVES = "흐름이 미리 그린 그림이 아니라 실제 실행 기록(runs · run_steps)으로만 칠해진다는 것";
const TOOLBAR = { links: [{ href: "/admin/simulator", label: "시뮬레이터" }, { href: "/admin/run-now", label: "지금 한 번 실행" }, { href: "/admin/demo", label: "실패 시연" }] };

/** asked: 주소의 ?run= 결과(없으면 null). runsError: 실행 목록을 못 읽음. stepsError: 고른 실행의 단계를 못 읽음 */
export type FlowBodyProps = {
  runs: RunListRow[]; picked: RunListRow | null; steps: StepDetail[]; node?: string;
  asked: { run: RunListRow | null; error: string | null } | null; runsError?: string | null; stepsError?: string | null;
};

export function FlowBody({ runs, picked, steps, node, asked, runsError, stepsError }: FlowBodyProps) {
  return (
    <AdminShell tab="flow" title={TITLE} lead={LEAD} proves={PROVES} error={runsError} toolbar={TOOLBAR} notes={[
      asked?.error ? { tone: "danger", text: `그 실행을 읽지 못했어요(없는 게 아니에요): ${asked.error}` } : null,
      asked && !asked.run && !asked.error ? { tone: "warning", text: "그 실행을 찾지 못했어요. 주소의 실행 id를 확인하거나 아래 목록에서 골라 주세요(다른 실행으로 대신 그리지 않아요)." } : null,
      picked && stepsError ? { tone: "danger", text: `이 실행의 단계를 읽지 못했어요(없는 게 아니에요): ${stepsError}` } : null,
    ]}>
      {picked && !stepsError ? (
        <AdminSection id="flow-diagram" title="실행 그림">
          <RunDiagram flow={flow} picked={picked} steps={steps} node={node} basePath="/admin/flow" />
        </AdminSection>
      ) : null}
      <AdminSection id="flow-runs" title="실행 목록" desc="줄을 누르면 그 실행으로 칠해요.">
        {runs.length === 0 ? <AdminEmpty>아직 실행 기록이 없어요. 시뮬레이터나 지금 한 번 실행을 돌리면 여기에 생겨요.</AdminEmpty>
          : <RunTable flow={flow} runs={runs} picked={picked} basePath="/admin/flow" />}
      </AdminSection>
    </AdminShell>
  );
}
