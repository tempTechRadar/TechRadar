// 회원별 등록(IA-12, PRD-F27): 회원마다 프로젝트·저장소 주소, 읽어 낸 기술 수, 마지막으로 읽은 시각. 회원·기간으로 거르기. 관리자만.
import { periodStart, pickId } from "@/lib/admin/admin-filter";
import { summarizeMembers, type MemberSummary } from "@/lib/admin/admin-summaries";
import { readMembers } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { AdminShell, FilterForm, PERIOD_OPTIONS, Select, when } from "../admin-shell";

type Search = Promise<{ member?: string; period?: string }>;
const TITLE = "회원별 등록";
const LEAD = "회원마다 등록한 프로젝트와 저장소 주소, 읽어 낸 기술 수(숨긴 것 제외), 마지막으로 읽은 시각이에요.";

export default async function MembersPage({ searchParams }: { searchParams: Search }) {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="members" title={TITLE} blocked={gate.blocked} />;
  const sp = await searchParams;
  const filter = { memberId: pickId(sp.member), from: periodStart(sp.period, new Date()) };
  let data: Awaited<ReturnType<typeof readMembers>> | null = null;
  let error: string | null = null;
  try { data = await readMembers(gate.db); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const members = data ? summarizeMembers(data, filter) : [];
  const memberOptions = [{ value: "", label: "모든 회원" }, ...(data?.profiles ?? []).map((p) => ({ value: p.id, label: p.nickname }))];

  return (
    <AdminShell tab="members" title={TITLE} lead={LEAD} error={error}>
      <FilterForm>
        <Select name="member" label="회원" value={filter.memberId ?? ""} options={memberOptions} />
        <Select name="period" label="기간(마지막 활동)" value={filter.from ? String(sp.period) : ""} options={PERIOD_OPTIONS} />
      </FilterForm>
      <p className="muted">{members.length}명</p>
      {members.length === 0 ? <p>조건에 맞는 회원이 없어요.</p> : <MemberTable members={members} />}
    </AdminShell>
  );
}

function MemberTable({ members }: { members: MemberSummary[] }) {
  return (
    <div className="admin-table-wrap">
      <table>
        <thead><tr><th>회원</th><th>프로젝트·저장소</th><th>기술 수</th><th>마지막으로 읽은 시각</th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.nickname} {m.isAdmin ? <span className="badge neutral">관리자</span> : null} {m.isDemo ? <span className="badge neutral">시연</span> : null}</td>
              <td>
                {m.projects.length === 0 ? <span className="muted">등록 없음</span> : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {m.projects.map((p) => (
                      <li key={`${p.name}-${p.repoUrl}`}>
                        {p.name} <span className="muted">· {p.repoUrl ?? "로컬(주소 없음)"} · 기술 {p.techCount}</span>
                        {p.archived ? <> <span className="badge neutral">보관</span></> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td>{m.techCount}</td>
              <td>{when(m.lastReadAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
