"use server";
// 관리자 "지금 한 번 실행"(P-17). 관리자만(불변 5, 화면과 서버 둘 다 확인). 서비스 키 클라이언트는 서버에서만.
import { redirect } from "next/navigation";
import { maskSecrets } from "@/lib/domain/redact";
import { SCHEDULE_COLLECTORS } from "@/lib/schedule/collectors";
import { runBatch } from "@/lib/schedule/run-batch";
import { classifyAfterBatch } from "@/lib/server/classify-store";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { flashQuery } from "@/lib/server/admin-flash";

const PAGE = "/admin/run-now";
const back = (key: "error" | "info", text: string) => redirect(`${PAGE}?${flashQuery(key, maskSecrets(text))}`);

export async function runNowAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return back("error", "관리자만 할 수 있어요.");
  const db = getServiceSupabase();
  if (!db) return back("error", "서비스 키가 없어요. 서버 설정(.env.local)을 확인해 주세요.");
  let target: string;
  try {
    const r = await runBatch({ db, collectors: SCHEDULE_COLLECTORS }, { trigger: "manual", startedBy: user.id });
    if (r.started) await classifyAfterBatch(db, r.runId);
    // 시작하지 않은 이유도 갈 곳(target)에 담는다: try 안에서 redirect하면 catch가 NEXT_REDIRECT를 잡아 이유가 사라진다
    target = r.started ? `/admin/flow?run=${r.runId}` : `${PAGE}?${flashQuery("info", maskSecrets(r.reason))}`;
  } catch (error) {
    return back("error", error instanceof Error ? error.message : String(error));
  }
  redirect(target);
}
