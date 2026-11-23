// 회원과 권한(IA-12, PRD-F27. 11-23 "회원별 등록"에서 이름 바꿈 — 등록 현황에 관리자 지정·되돌리기가 더해짐): 회원마다 프로젝트·저장소 주소, 읽어 낸 기술 수, 마지막으로 읽은 시각. 회원·기간으로 거르기. 관리자만.
// 페이지는 관리자 확인 · 읽기만, 그림은 body.tsx(I-admin-unify). 바꾸기는 actions.ts → DB 함수(admin_grant_admin · admin_revoke_admin). 화면에서 자기 줄을 숨겨도 DB가 다시 막는다.
import { periodStart, pickId } from "@/lib/admin/admin-filter";
import { summarizeMembers } from "@/lib/admin/admin-summaries";
import { readMembers } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { readFlash } from "@/lib/server/admin-flash";
import { AdminShell } from "../admin-shell";
import { MembersBody, TITLE } from "./body";

type Search = Promise<{ member?: string; period?: string; error?: string; info?: string; sig?: string }>;

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
    <MembersBody members={members} memberOptions={memberOptions} filter={{ member: filter.memberId ?? "", period: filter.from ? String(sp.period) : "" }}
      meId={gate.user.id} adminCount={adminCount} error={error} actionError={actionError} info={info} />
  );
}
