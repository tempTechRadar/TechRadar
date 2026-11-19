// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 적용 시나리오 카드(IA-8)의 상태들을 가짜 자료로 눈으로 보는 용도.
// 실제 기록이 아니다. 배포(운영·미리보기)에서는 404. 버튼은 로그인 전이라 눌러도 로그인 화면으로 간다.
import { notFound } from "next/navigation";
import type { ScenarioCard as Card } from "@/lib/alerts/to-scenario-view";
import { ScenarioCard } from "../../alerts/[id]/scenario-card";
import "../../alerts/alerts.css";

const link = (value: string, source: string | null) => ({ value, source, sourceIsLink: source !== null && /^https?:\/\//i.test(source) });

const DONE: Card = {
  state: "done",
  createdAtLabel: "11월 19일 14:02",
  comparison: {
    headers: { mine: "내 기술 sample-mcp-a", theirs: "대체 sample-mcp-d" },
    rows: [
      { item: "하는 일", mine: link("원격 MCP 서버에 연결해 줘요", "https://example.com/a"), theirs: link("원격 MCP 연결 프록시", "https://example.com/b") },
      { item: "보안 등급과 이유", mine: link("위험 — 심각한 문제가 있어요", "https://example.com/a"), theirs: link("통과 — 알려진 문제가 없어요", null) },
      { item: "사용량", mine: link("찾지 못함", null), theirs: link("찾지 못함", null) },
    ],
  },
  steps: ["고친 버전 0.1.16으로 올리는 것이 먼저예요. 설정 파일의 버전을 바꿔 주세요.", "설치 명령은 공식 문서에서 직접 확인하세요.", "바꾼 뒤 연결이 되는지 한 번 확인해요."],
  risks: ["위험: 버전을 올린 뒤 연결 설정이 달라질 수 있어요.", "되돌리기: 설정 파일의 버전을 이전 값으로 돌리면 돼요."],
  sources: [{ text: "https://example.com/advisory", isLink: true }, { text: "mcp-registry", isLink: false }],
};

const STATES: [string, Card | null][] = [
  ["① 만들기 전", { state: "idle", remaining: 4 }],
  ["② 만들었어요", DONE],
  ["③-1 만드는 중", { state: "generating" }],
  ["③-2 만들지 못했어요(다시 요청 가능)", { state: "failed", canRetry: true }],
  ["③-3 만들지 못했어요(오늘 한도 소진)", { state: "failed", canRetry: false }],
  ["③-4 오늘 5번을 다 썼어요", { state: "limit" }],
  ["③-5 읽지 못했어요", null],
];

export default function ScenarioSample() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="alerts">
      <p className="sample-banner" role="note">샘플 화면입니다. 이름과 숫자는 가짜 자료예요.</p>
      {STATES.map(([title, card]) => (
        <section key={title}>
          <h2>{title}</h2>
          <ScenarioCard alertId="00000000-0000-0000-0000-000000000000" card={card} />
        </section>
      ))}
    </main>
  );
}
