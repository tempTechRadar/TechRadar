// 관리자 첫 화면 = 관제 요약(IA-12–18 묶음, 11-23 리뉴얼). 숫자는 모두 DB에서 관리자 본인 권한으로 읽는다(서비스 키 아님). 관리자만(PRD-F3, 불변 5).
// 페이지는 관리자 확인 · 읽기만, 그림은 overview.tsx(I-admin-unify).
import { adminGate } from "@/lib/server/admin-gate";
import { readOverview } from "@/lib/server/admin-overview";
import { AdminShell } from "./admin-shell";
import { OVERVIEW_TITLE, OverviewBody } from "./overview";

export default async function AdminHome() {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="" title={OVERVIEW_TITLE} blocked={gate.blocked} />;
  const data = await readOverview(gate.db);
  return <OverviewBody data={data} />;
}
