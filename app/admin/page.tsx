// 관리자 첫 화면(IA-12–18 묶음). 탭으로 들어간다. 관리자만(PRD-F3, 불변 5).
import Link from "next/link";
import { adminGate } from "@/lib/server/admin-gate";
import { ADMIN_TABS, AdminShell } from "./admin-shell";

const ABOUT: Record<string, string> = {
  members: "회원마다 등록한 프로젝트·저장소와 읽어 낸 기술 수",
  observations: "출처에서 모은 값, 이전 값과 현재 값",
  alerts: "모든 회원의 알림과 판단 상태(보기만)",
  runs: "실행 기록, 수집 오류와 연속 실패",
  flow: "실제 실행 기록대로 칠한 흐름",
  classify: "갈래가 빈 기술, 같은 역할 후보, 규칙 목록",
  simulator: "가짜 변경 1건으로 처음부터 끝까지 시연",
  chat: "프로젝트 위키에 묻고 출처와 함께 답 받기(팀원만)",
};

export default async function AdminHome() {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="" title="관리자" blocked={gate.blocked} />;
  return (
    <AdminShell tab="" title="관리자" lead="관리자 화면은 보기 중심이에요. 알림 판단은 알림을 받은 본인만 해요.">
      <ul>
        {ADMIN_TABS.map((t) => (
          <li key={t.id} style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 8 }}>
            <Link href={t.href}>{t.label}</Link> <span className="muted">— {ABOUT[t.id]}</span>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
