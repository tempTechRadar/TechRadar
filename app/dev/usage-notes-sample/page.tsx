// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 사용기 카드(IA-4, PRD-F35)의 상태들을 가짜 자료로 눈으로 보는 용도.
// 실제 기록이 아니다. 배포(운영·미리보기)에서는 404. 버튼은 로그인 전이라 눌러도 로그인 화면으로 간다.
import { notFound } from "next/navigation";
import type { UsageNoteView } from "@/lib/server/usage-notes";
import { UsageNotes } from "../../projects/tech/[id]/usage-notes";
import "../../alerts/alerts.css";

const T = "00000000-0000-4000-8000-000000000001";
const P = "00000000-0000-4000-8000-000000000002";
const note = (n: number, over: Partial<UsageNoteView> = {}): UsageNoteView => ({
  id: `00000000-0000-4000-8000-00000000010${n}`, usedFor: "코딩 에이전트에 웹 검색을 붙이는 데 썼어요", result: "검색 결과가 잘 나왔고 설정은 10분 걸렸어요", tip: "API 키는 환경변수로 넣고 설정 파일에는 적지 마세요",
  helpfulCount: 4, createdAt: "2026-11-20T01:00:00Z", mine: false, voted: false, reported: false, ...over,
});
const LONG = "한글이긴글".repeat(40);
const TAG = '<script>alert(1)</script> **굵게** [링크](https://example.com)';

export default function UsageNotesSample() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="alerts">
      <h1>사용기 샘플 (가짜 자료)</h1>
      <h2>목록: 남의 글 · 내 글 · 이미 누름 · 이미 신고 · 긴 글 · 태그처럼 보이는 글</h2>
      <UsageNotes techId={T} pathId={P} notes={[
        note(1), note(2, { mine: true, helpfulCount: 0 }), note(3, { voted: true, helpfulCount: 5 }), note(4, { reported: true }),
        note(5, { usedFor: LONG, result: "ok", tip: "ok" }), note(6, { usedFor: TAG, result: TAG, tip: "줄바꿈\n두 번째 줄" }),
      ]} />
      <h2>비었을 때</h2>
      <UsageNotes techId={T} pathId={P} notes={[]} />
      <h2>읽지 못했을 때</h2>
      <UsageNotes techId={T} pathId={P} notes={null} />
    </main>
  );
}
