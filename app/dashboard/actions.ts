"use server";
// 첫 점검 띠의 "확인"(PRD-F14): 확인한 첫 읽기 실행 id를 쿠키 목록에 더해 그 실행의 띠는 다시 안 보이게 한다. DB는 안 건드린다.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { addSeenRunId, FIRST_CHECK_COOKIE, FIRST_CHECK_COOKIE_OPTIONS, parseRunId } from "@/lib/alerts/first-check-band";

export async function dismissFirstCheck(formData: FormData): Promise<void> {
  const runId = parseRunId(formData.get("runId"));
  if (runId === null) return;
  const jar = await cookies();
  jar.set(FIRST_CHECK_COOKIE, addSeenRunId(jar.get(FIRST_CHECK_COOKIE)?.value, runId), FIRST_CHECK_COOKIE_OPTIONS);
  revalidatePath("/dashboard");
  revalidatePath("/"); // 첫 화면 지도(P-12c)에도 같은 띠가 있다
}
