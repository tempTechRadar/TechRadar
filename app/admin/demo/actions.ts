"use server";
// 실패 시연 버튼의 서버 동작(P-20c, docs/flow.md 4절). 관리자만(불변 5, 화면과 서버 둘 다 확인), 시연 스위치가 켜졌을 때만.
// 서비스 키 클라이언트는 서버에서만 만든다. 판단 저장은 여기서 하지 않는다(⑤는 1회용 쿠키만 켠다).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { brokenOsvCollector, sameValueCollector } from "@/lib/demo/demo-collectors";
import { DEMO_FAIL_SAVE_COOKIE, DEMO_FAIL_SAVE_COOKIE_OPTIONS, isDemoSwitchEnabled } from "@/lib/demo/demo-switch";
import { maskSecrets } from "@/lib/domain/redact";
import { runBatch, type Collector } from "@/lib/schedule/run-batch";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServiceSupabase } from "@/lib/server/service-supabase";

const PAGE = "/admin/demo";
const back = (key: "error" | "info", text: string) => redirect(`${PAGE}?${key}=${encodeURIComponent(maskSecrets(text))}`);

async function adminWithSwitch() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return back("error", "관리자만 할 수 있어요.");
  if (!isDemoSwitchEnabled(process.env)) return back("error", "시연 스위치가 꺼져 있어요(운영 배포이거나 ENABLE_FAIL_DEMO가 true가 아님).");
  return user;
}

async function runDemoBatch(pick: (db: NonNullable<ReturnType<typeof getServiceSupabase>>) => Collector): Promise<void> {
  const user = await adminWithSwitch();
  const db = getServiceSupabase();
  if (!db) return back("error", "서비스 키가 없어요. 서버 설정(.env.local)을 확인해 주세요.");
  let target: string;
  try {
    // 지금 실행과 같은 묶음·같은 시작 상자(manual). 실패는 묶음이 실제로 기록한다.
    const r = await runBatch({ db, collectors: [pick(db)] }, { trigger: "manual", startedBy: user.id });
    if (!r.started) return back("info", r.reason);
    target = `/admin/flow?run=${r.runId}`;
  } catch (error) {
    return back("error", error instanceof Error ? error.message : String(error));
  }
  redirect(target);
}

/** ① 수집 오류: 일부러 틀린 OSV 주소로 지금 실행 */
export async function demoCollectErrorAction(): Promise<void> {
  await runDemoBatch(() => brokenOsvCollector());
}

/** ② 사건 아님: 같은 값을 다시 읽기(두 번 누르면 "변화 없음") */
export async function demoNoChangeAction(): Promise<void> {
  await runDemoBatch((db) => sameValueCollector(db));
}

/** ⑤ 저장 실패: 이 브라우저에서 시연 계정의 다음 판단 저장 1번을 실패시키는 쿠키(10분) */
export async function armSaveFailureAction(): Promise<void> {
  await adminWithSwitch();
  (await cookies()).set(DEMO_FAIL_SAVE_COOKIE, "1", DEMO_FAIL_SAVE_COOKIE_OPTIONS);
  back("info", "켰어요. 10분 안에 이 브라우저에서 시연 계정으로 로그인해 알림 하나를 판단하면 저장이 한 번 실패해요.");
}

export async function disarmSaveFailureAction(): Promise<void> {
  await adminWithSwitch();
  (await cookies()).delete(DEMO_FAIL_SAVE_COOKIE);
  back("info", "껐어요. 판단 저장은 평소대로 돼요.");
}
