"use server";
// 시뮬레이터 서버 동작(P-5). 관리자만(불변 5, 화면과 서버 둘 다 확인). 서비스 키 클라이언트는 여기서만 만든다.
import { redirect } from "next/navigation";
import { maskSecrets } from "@/lib/domain/redact";
import { createAlertsForChange } from "@/lib/server/alerts";
import { saveChange } from "@/lib/server/changes";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { clearSimulated, runSimulator } from "@/lib/server/simulator";
import { runOpportunitySimulator } from "@/lib/server/simulator-opportunity";

const PAGE = "/admin/simulator";
const back = (key: "error" | "cleared", text: string) => redirect(`${PAGE}?${key}=${encodeURIComponent(maskSecrets(text))}`);

async function adminAndDb() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return back("error", "관리자만 할 수 있어요.");
  const db = getServiceSupabase();
  if (!db) return back("error", "서비스 키가 없어요. 서버 설정(.env.local)을 확인해 주세요.");
  return { user, db };
}

export async function runSimulatorAction(): Promise<void> {
  const { user, db } = await adminAndDb();
  let target: string;
  try {
    const result = await runSimulator({ db, saveChange, createAlertsForChange }, { adminId: user.id });
    // 알림 0건이면 흐름 화면에는 이유를 보여 줄 곳이 없으니 이 화면으로 돌아와 이유를 알린다(숨기지 않기)
    target = result.alertsCreated > 0 ? `/admin/flow?run=${result.runId}` : `${PAGE}?info=${encodeURIComponent(maskSecrets(result.note))}&run=${result.runId}`;
  } catch (error) {
    return back("error", error instanceof Error ? error.message : String(error));
  }
  redirect(target);
}

/** 두 번째 시나리오: 적용 기회(SPEC-3.5 셋째 줄). 시연 계정에 기술이 없으면 실행 기록을 만들지 않고 이유만 알린다 */
export async function runOpportunityAction(): Promise<void> {
  const { user, db } = await adminAndDb();
  let target: string;
  try {
    const r = await runOpportunitySimulator({ db, saveChange, createAlertsForChange }, { adminId: user.id });
    // 시작하지 않은 이유도 갈 곳(target)에 담는다: try 안에서 redirect하면 catch가 NEXT_REDIRECT를 잡아 이유가 사라진다
    target = !r.started ? `${PAGE}?error=${encodeURIComponent(maskSecrets(r.reason))}`
      : r.alertsCreated > 0 ? `/admin/flow?run=${r.runId}` : `${PAGE}?info=${encodeURIComponent(maskSecrets(r.note))}&run=${r.runId}`;
  } catch (error) {
    return back("error", error instanceof Error ? error.message : String(error));
  }
  redirect(target);
}

export async function clearSimulatedAction(): Promise<void> {
  const { user, db } = await adminAndDb();
  let text: string;
  try {
    const r = await clearSimulated({ db }, { adminId: user.id });
    text = `변경 ${r.changes}건, 알림 ${r.alerts}건, 판단 ${r.judgments}건, 시나리오 ${r.scenarios}건, 수집 자료 ${r.observations}건, 같은 역할 관계 ${r.relations}건, 기술 ${r.technologies}건을 지웠어요(내 기술이 쓰는 가짜 기술 ${r.keptTechnologies}건은 남김).`;
  } catch (error) {
    return back("error", error instanceof Error ? error.message : String(error));
  }
  back("cleared", text);
}
