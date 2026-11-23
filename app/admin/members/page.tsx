// 회원과 권한(IA-12, PRD-F27. 11-23 "회원별 등록"에서 이름 바꿈 — 등록 현황에 관리자 지정·되돌리기가 더해짐): 회원마다 프로젝트·저장소 주소, 읽어 낸 기술 수, 마지막으로 읽은 시각. 회원·기간으로 거르기. 관리자만.
// 일반 계정 줄에는 "관리자로 지정"(I-P-admin-grant), 다른 관리자 줄에는 "일반 계정으로 되돌리기"(I-P-admin-revoke). 둘 다 사유 + 확인 체크,
// 바꾸기는 actions.ts → DB 함수(admin_grant_admin · admin_revoke_admin). 화면에서 자기 줄을 숨겨도 DB가 다시 막는다.
import { periodStart, pickId } from "@/lib/admin/admin-filter";
import { summarizeMembers, type MemberSummary } from "@/lib/admin/admin-summaries";
import { readMembers } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { readFlash } from "@/lib/server/admin-flash";
import { grantAdminAction, revokeAdminAction } from "./actions";
import { RoleDialog } from "./role-dialog";
import { AdminShell, FilterForm, PERIOD_OPTIONS, Select, when } from "../admin-shell";

type Search = Promise<{ member?: string; period?: string; error?: string; info?: string; sig?: string }>;
const TITLE = "회원과 권한";
const LEAD = "회원마다 등록한 프로젝트와 저장소 주소, 읽어 낸 기술 수(숨긴 것 제외), 마지막으로 읽은 시각이에요. 오른쪽 \"권한\" 칸에서 일반 계정을 관리자로 지정하거나, 다른 관리자를 일반 계정으로 되돌려요(사유와 함께 기록돼요).";

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
  // 마지막 관리자 표시는 거르기와 상관없이 전체 회원으로 센다(거르면 다른 관리자가 표에서 빠질 수 있음)
  const adminCount = (data?.profiles ?? []).filter((p) => p.role === "admin").length;
  const memberOptions = [{ value: "", label: "모든 회원" }, ...(data?.profiles ?? []).map((p) => ({ value: p.id, label: p.nickname }))];

  return (
    <AdminShell tab="members" title={TITLE} lead={LEAD} proves="관리자 권한을 주고 거두는 일도 사유와 함께 기록되고, 화면을 거치지 않아도 DB가 다시 막는다는 것" error={error}>
      {actionError ? <p role="alert" className="admin-note danger">{actionError}</p> : null}
      {info ? <p role="status" className="admin-note">{info}</p> : null}
      <FilterForm>
        <Select name="member" label="회원" value={filter.memberId ?? ""} options={memberOptions} />
        <Select name="period" label="기간(마지막 활동)" value={filter.from ? String(sp.period) : ""} options={PERIOD_OPTIONS} />
      </FilterForm>
      <p className="muted">{members.length}명</p>
      {members.length === 0 ? <p>조건에 맞는 회원이 없어요.</p> : <MemberTable members={members} meId={gate.user.id} adminCount={adminCount} />}
    </AdminShell>
  );
}

function MemberTable({ members, meId, adminCount }: { members: MemberSummary[]; meId: string; adminCount: number }) {
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
              <td><RoleCell member={m} isMe={m.id === meId} lastAdmin={adminCount <= 1} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 칸에는 상태 글이나 버튼 하나만 둔다(입력은 대화상자에서 받아 표가 흔들리지 않게). 나·마지막 관리자·시연 계정은 글로만. */
function RoleCell({ member: m, isMe, lastAdmin }: { member: MemberSummary; isMe: boolean; lastAdmin: boolean }) {
  if (m.isAdmin && isMe) return <span className="muted">관리자(나)</span>;
  if (m.isAdmin && lastAdmin) return <span className="muted">관리자(마지막 한 명)</span>;
  if (m.isAdmin) return (
    <span className="role-cell"><span className="badge neutral">관리자</span>
      <RoleDialog memberId={m.id} nickname={m.nickname} action={revokeAdminAction} danger label="일반으로 되돌리기" title="일반 계정으로 되돌리기"
        confirm={`${m.nickname}님의 관리자 권한을 거두고 일반 계정으로 되돌린다는 것을 확인했어요`} /></span>
  );
  if (m.isDemo) return <span className="muted">시연 계정(지정 불가)</span>;
  return <RoleDialog memberId={m.id} nickname={m.nickname} action={grantAdminAction} label="관리자로 지정" title="관리자로 지정"
    confirm={`${m.nickname}님에게 관리자 권한(모든 회원 자료 보기·관리)을 준다는 것을 확인했어요`} />;
}
