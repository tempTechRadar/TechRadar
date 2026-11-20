// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 관리자 "사용기 신고" 카드(IA-23, P-24 24b)의 상태들을 가짜 자료로 눈으로 보는 용도.
// 실제 기록이 아니다. 배포(운영·미리보기)에서는 404. 버튼은 로그인 전이라 눌러도 로그인 화면으로 간다.
import { notFound } from "next/navigation";
import type { ReportGroup } from "@/lib/admin/report-groups";
import { AdminShell } from "../../admin/admin-shell";
import { ReportCard } from "../../admin/reports/report-card";

const NOTE_ID = (n: number) => `00000000-0000-4000-8000-00000000020${n}`;
const T = "TAG: <script>alert(1)</script> **굵게** [링크](https://example.com)";
const base = (n: number, over: Partial<ReportGroup> = {}): ReportGroup => ({
  noteId: NOTE_ID(n), techName: "@cyanheads/filesystem-mcp-server", hidden: false, helpfulCount: 4, pendingCount: 2, handledCount: 0,
  lastReportAt: "2026-11-20T02:00:00Z", handledAt: null, handleReason: null,
  note: { id: NOTE_ID(n), techId: "t", usedFor: "코딩 에이전트에 파일을 읽고 쓰게 하는 데 썼어요", result: "설치는 쉬웠는데 권한 설정이 어려웠어요", tip: "허용 폴더를 꼭 좁혀 두세요", helpfulCount: 4, hiddenAt: null, createdAt: "2026-11-20T01:18:00Z" },
  reasons: [{ reason: "광고 같아요", at: "2026-11-20T02:00:00Z", handled: false }, { reason: "관계없는 링크가 있어요", at: "2026-11-20T01:30:00Z", handled: false }],
  ...over,
});

export default function ReportsSample() {
  if (process.env.NODE_ENV === "production") notFound();
  const hiddenNote = { ...base(2).note!, hiddenAt: "2026-11-20T03:00:00Z", usedFor: T, result: T, tip: "줄바꿈\n두 번째 줄" };
  const groups: ReportGroup[] = [
    base(1),
    base(2, { techName: "mcp-server-kubernetes", hidden: true, pendingCount: 1, note: hiddenNote, reasons: [{ reason: "욕설이 있어요", at: "2026-11-20T00:12:00Z", handled: false }] }),
    base(3, { techName: "mcp-proxy", pendingCount: 0, handledCount: 1, handledAt: "2026-11-20T02:20:00Z", handleReason: "문제 없는 글로 확인", reasons: [{ reason: "광고 같아요", at: "2026-11-20T01:00:00Z", handled: true }] }),
    base(4, { techName: null, note: null, reasons: [{ reason: "글이 지워졌어요 " + "긴사유".repeat(40), at: "2026-11-20T01:00:00Z", handled: false }] }),
  ];
  return (
    <AdminShell tab="reports" title="사용기 신고 샘플 (가짜 자료)" lead="처리 전 · 숨긴 글(내용 접힘, 태그처럼 보이는 글) · 처리함 · 글을 못 찾은 신고">
      {groups.map((g) => <ReportCard key={g.noteId} g={g} />)}
    </AdminShell>
  );
}
