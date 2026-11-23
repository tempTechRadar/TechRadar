// 관리자 첫 화면 = 관제 요약(IA-12–18 묶음, 11-23 리뉴얼). 숫자는 모두 DB에서 관리자 본인 권한으로 읽는다(서비스 키 아님). 관리자만(PRD-F3, 불변 5).
import { adminGate } from "@/lib/server/admin-gate";
import { readOverview } from "@/lib/server/admin-overview";
import { AdminShell } from "./admin-shell";
import { AdminOverview } from "./overview";

const TITLE = "관제 요약";
const LEAD = "정기 실행 · 수집 오류 · 사람 판단 · 분류 확인 거리를 한 장에 모았어요. 숫자를 누르면 그 화면으로 가요.";
const PROVES = "자동으로 지켜본 결과와 실패가 숫자로 남고, 판단 대기는 사람 차례로 남아 있다는 것";

export default async function AdminHome() {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="" title={TITLE} blocked={gate.blocked} />;
  const data = await readOverview(gate.db);
  return (
    <AdminShell tab="" title={TITLE} lead={LEAD} proves={PROVES}>
      <AdminOverview data={data} />
    </AdminShell>
  );
}
