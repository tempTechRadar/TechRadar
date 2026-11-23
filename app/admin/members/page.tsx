// 회원별 등록(IA-12, PRD-F27): 회원마다 프로젝트·저장소 주소, 읽어 낸 기술 수, 마지막으로 읽은 시각. 회원·기간으로 거르기. 관리자만.
// 일반 계정 줄에는 "관리자로 지정"(사유 + 확인 체크, 작업 I-P-admin-grant). 바꾸기는 actions.ts → DB 함수 admin_grant_admin.
import { periodStart, pickId } from "@/lib/admin/admin-filter";
import { summarizeMembers, type MemberSummary } from "@/lib/admin/admin-summaries";
import { readMembers } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { readFlash } from "@/lib/server/admin-flash";
import { grantAdminAction } from "./actions";
import { AdminShell, FilterForm, PERIOD_OPTIONS, Select, when } from "../admin-shell";

type Search = Promise<{ member?: string; period?: string; error?: string; info?: string; sig?: string }>;
const TITLE = "회원별 등록";
const LEAD = "회원마다 등록한 프로젝트와 저장소 주소, 읽어 낸 기술 수(숨긴 것 제외), 마지막으로 읽은 시각이에요.";

export default async function MembersPage({ searchParams }: { searchParams: Search }) {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="members" title={TITLE} blocked={gate.blocked} />;
  const sp = await searchParams;
  const actionError = readFlash("error", sp.error, sp.sig);
  const info = readFlash("info", sp.info, sp.sig);
  const filter = { memberId: pickId(sp.member), from: periodStart(sp.period, new Date()) };
  let data: Awaited<ReturnType<typeof readMembers>> | null = null;
  let error: string | null = null;
  try { data = await readMembers(gate.db); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const members = data ? summarizeMembers(data, filter) : [];
  const memberOptions = [{ value: "", label: "모든 회원" }, ...(data?.profiles ?? []).map((p) => ({ value: p.id, label: p.nickname }))];

  return (
    <AdminShell tab="members" title={TITLE} lead={LEAD} error={error}>
      {actionError ? <p role="alert" className="admin-note danger">{actionError}</p> : null}
      {info ? <p role="status" className="admin-note">{info}</p> : null}
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
        <thead><tr><th>회원</th><th>프로젝트·저장소</th><th>기술 수</th><th>마지막으로 읽은 시각</th><th>권한</th></tr></thead>
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
              <td><RoleCell member={m} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 관리자·시연 계정은 글로만, 일반 계정은 접힌 지정 칸(자바스크립트 없이 동작). 확인 체크와 사유는 서버가 다시 본다. */
function RoleCell({ member: m }: { member: MemberSummary }) {
  if (m.isAdmin) return <span className="muted">관리자</span>;
  if (m.isDemo) return <span className="muted">시연 계정(지정 불가)</span>;
  return (
    <details>
      <summary>관리자로 지정</summary>
      <form action={grantAdminAction} style={{ display: "grid", gap: 6, marginTop: 6, minWidth: 220 }}>
        <input type="hidden" name="id" value={m.id} />
        <label>
          사유(5~300자, 바꾼 기록에 남아요)
          <input name="reason" required minLength={5} maxLength={300} autoComplete="off" placeholder="예: 운영 점검을 함께 맡기로 함" />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <input type="checkbox" name="confirm" value="yes" required />
          <span>{m.nickname}님에게 관리자 권한(모든 회원 자료 보기·관리)을 준다는 것을 확인했어요</span>
        </label>
        <button type="submit">관리자로 지정</button>
      </form>
    </details>
  );
}
