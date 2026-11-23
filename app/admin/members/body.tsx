// 회원과 권한 본문(관리자 화면 문법). 페이지(읽기 · 관리자 확인)와 개발용 견본(/dev/admin-sample/members)이 같이 쓴다.
// 일반 계정 줄에는 "관리자로 지정", 다른 관리자 줄에는 "일반 계정으로 되돌리기". 둘 다 사유 + 확인 체크, 바꾸기는 actions.ts → DB 함수.
import type { MemberSummary } from "@/lib/admin/admin-summaries";
import { grantAdminAction, revokeAdminAction } from "./actions";
import { RoleDialog } from "./role-dialog";
import { AdminShell, FilterForm, PERIOD_OPTIONS, Select, when } from "../admin-shell";
import { AdminEmpty, AdminSection } from "../admin-ui";

export const TITLE = "회원과 권한";
const LEAD = "회원마다 등록한 프로젝트와 저장소 주소, 읽어 낸 기술 수(숨긴 것 제외), 마지막으로 읽은 시각이에요. 오른쪽 \"권한\" 칸에서 일반 계정을 관리자로 지정하거나, 다른 관리자를 일반 계정으로 되돌려요(사유와 함께 기록돼요).";
const PROVES = "관리자 권한을 주고 거두는 일도 사유와 함께 기록되고, 화면을 거치지 않아도 DB가 다시 막는다는 것";
const TOOLBAR = { links: [{ href: "/admin/classify", label: "분류 확인" }, { href: "/admin/reports", label: "사용기 신고" }] };

export type MembersBodyProps = {
  members: MemberSummary[]; memberOptions: { value: string; label: string }[]; filter: { member: string; period: string };
  meId: string; adminCount: number; error?: string | null; actionError?: string; info?: string;
};

export function MembersBody({ members, memberOptions, filter, meId, adminCount, error, actionError, info }: MembersBodyProps) {
  return (
    <AdminShell tab="members" title={TITLE} lead={LEAD} proves={PROVES} error={error} toolbar={TOOLBAR}
      notes={[actionError ? { tone: "danger", text: actionError } : null, info ? { tone: "info", text: info } : null]}>
      <FilterForm>
        <Select name="member" label="회원" value={filter.member} options={memberOptions} />
        <Select name="period" label="기간(마지막 활동)" value={filter.period} options={PERIOD_OPTIONS} />
      </FilterForm>
      <AdminSection id="members-list" title="회원 목록" desc={`${members.length}명`}>
        {members.length === 0 ? <AdminEmpty>조건에 맞는 회원이 없어요.</AdminEmpty> : <MemberTable members={members} meId={meId} adminCount={adminCount} />}
      </AdminSection>
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
                  <ul className="admin-cell-list">
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
