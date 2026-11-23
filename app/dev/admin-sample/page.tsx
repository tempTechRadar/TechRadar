// 개발 컴퓨터(next dev)에서만 열리는 견본 화면: 관리자 새 틀(묶음 메뉴) + 관제 요약을 가짜 숫자로 눈으로 보는 용도(11-23 관리자 리뉴얼).
// 실제 기록이 아니다. 배포(운영·미리보기)에서는 404(reports-sample과 같은 가드). 로그인 없이 열리고, 메뉴 링크는 눌러도 로그인 화면으로 간다.
// 다른 관리자 화면 견본은 /dev/admin-sample/[view](members · observations · alerts · runs · flow · classify · simulator · chat · run-now · demo).
import { notFound } from "next/navigation";
import type { OverviewData } from "@/lib/server/admin-overview";
import { OverviewBody } from "../../admin/overview";

const NOW = new Date("2026-11-23T05:30:00Z");
// 한 칸은 일부러 "읽지 못함"(불변 2: 0으로 보이지 않는지 확인용)
const SAMPLE: OverviewData = {
  scan: { state: "ok", runId: "00000000-0000-4000-8000-000000000301", at: "2026-11-22T21:07:00Z", sources: 6, errors: 1, otherFailed: 0, runFailed: false, running: false },
  pendingAlerts: { ok: true, value: 3 },
  pendingReports: { ok: false, reason: "처리 전 신고: (가짜) permission denied for table reports" },
  unclassified: { ok: true, value: 12 },
  relationCandidates: { ok: true, value: 0 },
  week: { ok: true, total: 14, failed: 2, partial: 1, capped: false },
};

export default function AdminSample() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <OverviewBody data={SAMPLE} now={NOW} title="관제 요약 (견본 · 가짜 숫자)" lead="개발 컴퓨터에서만 열리는 견본이에요. 아래 숫자는 모두 지어낸 값이고 DB를 읽지 않아요."
      sampleNote={"가짜 값 견본: 실제 기록이 아니에요. \"처리 전 사용기 신고\"는 읽지 못한 경우를 보이려고 일부러 실패로 넣었어요."} />
  );
}
