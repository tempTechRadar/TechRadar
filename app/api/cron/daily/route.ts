// 매일 06:00(한국 시간) 정기 실행 엔드포인트(P-17). vercel.json의 crons가 부른다(UTC 21:00, Hobby는 그 시간 안 아무 때나).
// 비밀 헤더(CRON_SECRET)가 맞을 때만 돈다. 서비스 키는 서버에서만.
import { SCHEDULE_COLLECTORS } from "@/lib/schedule/collectors";
import { cronAuthorized } from "@/lib/schedule/cron-auth";
import { runBatch } from "@/lib/schedule/run-batch";
import { classifyAfterBatch } from "@/lib/server/classify-store";
import { getServiceSupabase } from "@/lib/server/service-supabase";

export const dynamic = "force-dynamic"; // 캐시된 응답이면 예약 실행이 돌지 않는다(공식 문서)
export const maxDuration = 300; // Hobby 최대(2026-11 공식 문서). 묶음은 그보다 짧게 끊는다(DEFAULT_BUDGET_MS)

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = getServiceSupabase();
  if (!db) return Response.json({ ok: false, reason: "서비스 키가 없어요" }, { status: 500 });
  try {
    const result = await runBatch({ db, collectors: SCHEDULE_COLLECTORS }, { trigger: "schedule" });
    if (result.started) await classifyAfterBatch(db, result.runId); // 그날 레지스트리가 넣은 새 기술까지 갈래를 받는다
    return Response.json({ ok: true, ...result });
  } catch (error) {
    // 오류 내용은 실행 기록(run_steps)에 가려서 남았다. 응답에는 내용을 싣지 않는다
    return Response.json({ ok: false, reason: "실행 중 오류(실행 기록 확인)" }, { status: 500 });
  }
}
