// 상자 누르기 상세(docs/flow.md 3절): 설정·들어온 것·나간 것·호출·오류. 저장 때 가린 값만 보여 주고, 한 번 더 가린다(SPEC-8).
import { maskSecrets } from "../domain/redact.ts";
import type { FlowNode, StepDetail } from "./types.ts";

export const STEP_STATUS: Record<StepDetail["status"], string> = {
  waiting: "대기", running: "실행 중", succeeded: "성공", failed: "실패", awaiting_judgment: "판단 대기",
};
export const ERROR_KIND: Record<string, string> = {
  timeout: "시간 초과", network: "네트워크", rate_limited: "호출 한도 초과", http_status: "상태 코드", parse: "응답 읽기 실패",
};

export type Field = { label: string; value: string };
export type StepView = { status: string; fields: Field[] };
export type NodeDetail = { id: string; name: string; config: Field[]; steps: StepView[]; empty: boolean };

const show = (v: unknown): string => maskSecrets(Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));

function configFields(node: FlowNode): Field[] {
  return Object.entries(node.config ?? {}).map(([k, v]) => ({ label: k, value: show(v) }));
}

function stepFields(s: StepDetail): Field[] {
  const f: Field[] = [];
  const add = (label: string, v: unknown) => { if (v !== null && v !== undefined && v !== "") f.push({ label, value: show(v) }); };
  add("들어온 것", s.input_summary);
  add("나간 것", s.output_summary);
  add("들어온 건수", s.count_in);
  add("나간 건수", s.count_out);
  if (s.branch_counts) add("갈래", Object.entries(s.branch_counts).map(([k, n]) => `${k} ${n}`).join(" / "));
  add("호출 주소", s.api_url);
  add("응답 코드", s.http_status);
  if (typeof s.duration_ms === "number") add("걸린 시간", formatMs(s.duration_ms));
  if (s.error_kind) add("오류 종류", ERROR_KIND[s.error_kind] ?? s.error_kind);
  add("오류 내용", s.error_message);
  return f;
}

/** 밀리초를 읽기 쉬운 글로(0.4초, 12초, 2분 5초) */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}초`;
  const sec = Math.round(ms / 1000);
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

/** 누른 상자 하나의 상세. 그 실행에 기록이 없으면 empty=true(회색 상자와 같은 뜻). */
export function nodeDetail(node: FlowNode, steps: StepDetail[]): NodeDetail {
  const mine = steps.filter((s) => s.step_name === node.id);
  return {
    id: node.id,
    name: node.name,
    config: configFields(node),
    steps: mine.map((s) => ({ status: STEP_STATUS[s.status] ?? s.status, fields: stepFields(s) })),
    empty: mine.length === 0,
  };
}
