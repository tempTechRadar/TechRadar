"use server";
// 채점 실행 서버 동작(P-20, PRD-F30). 관리자만(불변 5). 시연 스위치와 무관(채점은 진짜 기능). 서비스 키는 서버에서만.
import { maskSecrets } from "@/lib/domain/redact";
import type { Score } from "@/lib/eval/score";
import { readStoredEdges, type StoredEdges } from "@/lib/eval/stored-edges";
import { getCurrentUser } from "@/lib/server/current-user";
import { fsReader, runScoring } from "@/lib/server/eval-run";
import { getServiceSupabase } from "@/lib/server/service-supabase";

/** stored: `npm run eval`이 저장해 둔 경계 사례 결과. 화면에서는 다시 돌리지 않는다(lib/eval/stored-edges.ts 머리 주석) */
export type EvalState = { ok: true; runId: string; score: Score; when: string; stored: StoredEdges } | { ok: false; message: string } | null;

export async function runEvalAction(_prev: EvalState): Promise<EvalState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, message: "관리자만 할 수 있어요." };
  const db = getServiceSupabase();
  if (!db) return { ok: false, message: "서비스 키가 없어요. 서버 설정(.env.local)을 확인해 주세요." };
  try {
    const reader = fsReader(process.cwd());
    const { runId, score } = await runScoring({ db, reader }, { adminId: user.id });
    const when = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    return { ok: true, runId, score, when, stored: readStoredEdges(reader) };
  } catch (error) {
    return { ok: false, message: maskSecrets(error instanceof Error ? error.message : String(error)) };
  }
}
