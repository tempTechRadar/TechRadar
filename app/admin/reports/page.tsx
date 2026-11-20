// 사용기 신고(IA-23, PRD-F35, P-24 24b): 신고된 사용기를 글별로 보고, 글 숨기기·숨김 풀기·신고 처리함. 판단 버튼이 아니다(불변 1은 알림 판단 이야기).
// 쓴 사람·신고한 사람은 읽지도 보이지도 않는다. 글은 글자 그대로 그린다(해석 안 함). 와이어프레임 docs/wireframes/reports.html.
import Link from "next/link";
import { groupReports, type ReportFilter } from "@/lib/admin/report-groups";
import { adminGate } from "@/lib/server/admin-gate";
import { readReports } from "@/lib/server/moderation-edit";
import { AdminShell } from "../admin-shell";
import { ReportCard } from "./report-card";

const TITLE = "사용기 신고";
const LEAD = "사용자가 신고한 사용기예요. 글을 숨기면 쓴 사람 말고는 볼 수 없어요. 숨기기·풀기·처리는 사유를 남겨요(담당자·시각·사유). 쓴 사람과 신고한 사람은 보이지 않아요.";
const FILTERS: { id: ReportFilter; label: string }[] = [{ id: "pending", label: "처리 전" }, { id: "handled", label: "처리함" }, { id: "all", label: "전체" }];

type Data = NonNullable<Awaited<ReturnType<typeof readReports>>>;
type Search = { f?: string; error?: string; info?: string };
const asFilter = (v: string | undefined): ReportFilter => (v === "handled" || v === "all" ? v : "pending");

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="reports" title={TITLE} blocked={gate.blocked} />;
  const { f, error: actionError, info } = await searchParams;
  const filter = asFilter(f);
  let data: Data | null = null;
  let error: string | null = null;
  let missing = false;
  try {
    const read = await readReports(gate.db);
    if (read === null) missing = true; else data = read;
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const view = data ? groupReports({ ...data, filter }) : null;

  return (
    <AdminShell tab="reports" title={TITLE} lead={LEAD} error={error}>
      {actionError ? <p role="alert" className="admin-note danger">{actionError}</p> : null}
      {info ? <p role="status" className="admin-note">{info}</p> : null}
      {missing ? <p role="alert" className="admin-note warning">사용기 표가 아직 DB에 없어요(마이그레이션 적용 대기). 다른 관리자 탭은 그대로예요.</p> : null}
      {view ? (
        <>
          <nav aria-label="거르기" className="admin-filter">
            {FILTERS.map((x) => (
              <Link key={x.id} href={`/admin/reports?f=${x.id}`} aria-current={x.id === filter ? "true" : undefined} className="admin-seg">
                {x.label} ({view.counts[x.id]})
              </Link>
            ))}
          </nav>
          {view.groups.length === 0 ? <p>{filter === "pending" ? "처리 전 신고가 없어요." : filter === "handled" ? "처리함인 신고가 없어요." : "신고가 없어요."}</p> : null}
          {view.groups.map((g) => <ReportCard key={g.noteId} g={g} />)}
        </>
      ) : null}
    </AdminShell>
  );
}
