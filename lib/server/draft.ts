// 대응안 초안 만들기(PRD-F15, SPEC-9, flow.md `summarize`). 주인: 황재웅(B). 서비스 키 클라이언트로 부른다(ai_calls·changes 쓰기는 서버).
// 변경마다 1번(공용). 알림 만들기 앞에서 부르고, 실패해도 던지지 않는다: 알림은 그대로 만들고 초안 칸은 "만들지 못함"으로 남긴다.
// 규칙은 decideAiCall·buildDraftPrompt·parseDraftResponse(순수 함수)가 정하고, 여기서는 읽기·쓰기·기록만 한다.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { buildDraftPrompt } from "../ai/build-draft-prompt.ts";
import { decideAiCall, startOfKoreanDay } from "../ai/decide-ai-call.ts";
import { parseDraftResponse } from "../ai/parse-draft-response.ts";
import { GRADE_LABEL } from "../alerts/to-alert-view.ts";
import { cleanForLog, maskSecrets } from "../domain/redact.ts";
import { failure, rowsOrThrow, type Row } from "./alert-db.ts";
import { recordStep } from "./run-log.ts";

export type DraftResult =
  | { status: "created" }
  | { status: "skipped"; reason: "already_drafted" | "not_security" | "user_limit" | "service_limit" }
  | { status: "failed"; reason: string };

type Input = { changeId: string; runId?: string; now?: Date };

const SECURITY_CHANGE_KINDS = ["grade_to_danger", "first_seen_danger"];

const grade = (value: unknown) => GRADE_LABEL[String(value)] ?? null;

/** 기록(ai_calls)이 안 남아도 초안 결과는 바뀌지 않는다: 오류만 로그로 남긴다 */
async function logCall(db: SupabaseClient, row: Row): Promise<void> {
  const { error } = await db.from("ai_calls").insert({ purpose: "draft", user_id: null, ...row });
  if (error) console.error("ai_calls를 기록하지 못함", maskSecrets(error.message));
}

async function callAndSave(db: SupabaseClient, ai: AiClient, change: Row, input: Input): Promise<DraftResult> {
  const techRow = (await db.from("technologies").select("display_name").eq("id", change.tech_id).single()).data as Row | null;
  const curr = (change.curr_value ?? {}) as Row;
  const evidence = (Array.isArray(curr.evidence) ? curr.evidence : []).filter((e: Row) => typeof e?.id === "string" && typeof e?.url === "string");
  const prompt = buildDraftPrompt({
    techName: techRow?.display_name ?? "찾지 못함",
    prevGrade: grade(change.prev_value?.grade),
    currGrade: grade(curr.grade) ?? "찾지 못함",
    reason: curr.reason ?? null,
    fixedVersion: curr.fixed_version ?? null,
    evidence: evidence.map((e: Row) => ({ id: e.id, severity: String(e.severity ?? "찾지 못함"), url: e.url })),
    outsideTexts: [],
  });
  const inputHash = createHash("sha256").update(`${prompt.system}\n${prompt.user}`).digest("hex");

  let answer: Awaited<ReturnType<AiClient["complete"]>>;
  try {
    answer = await ai.complete({ system: prompt.system, user: prompt.user });
  } catch (error) {
    const message = cleanForLog(error instanceof Error ? error.message : String(error)) ?? "";
    await logCall(db, { input_hash: inputHash, status: "failed", error: message });
    return { status: "failed", reason: message };
  }
  const parsed = parseDraftResponse(answer.text, prompt.allowedSources);
  if (!parsed.ok) {
    await logCall(db, { input_hash: inputHash, tokens_in: answer.tokensIn ?? null, tokens_out: answer.tokensOut ?? null, status: "failed", error: parsed.error });
    return { status: "failed", reason: parsed.error };
  }
  // 그 사이 다른 쪽이 먼저 만들었으면(draft_response가 더는 비어 있지 않으면) 덮어쓰지 않는다
  const saved = await db.from("changes").update({ draft_response: parsed.draft, draft_sources: parsed.sources }).eq("id", input.changeId).is("draft_response", null).select("id");
  const updated = rowsOrThrow(saved, "초안을 저장하지 못함");
  await logCall(db, { input_hash: inputHash, tokens_in: answer.tokensIn ?? null, tokens_out: answer.tokensOut ?? null, status: "succeeded" });
  return updated.length > 0 ? { status: "created" } : { status: "skipped", reason: "already_drafted" };
}

async function createDraft(db: SupabaseClient, ai: AiClient | null, input: Input): Promise<DraftResult> {
  const { data, error } = await db.from("changes").select("kind, tech_id, prev_value, curr_value, draft_response").eq("id", input.changeId).single();
  if (error || !data) throw failure("변경을 읽지 못함", error?.message);
  const change = data as Row;
  if (!SECURITY_CHANGE_KINDS.includes(change.kind)) return { status: "skipped", reason: "not_security" };
  const today = rowsOrThrow(await db.from("ai_calls").select("id").gte("created_at", startOfKoreanDay(input.now ?? new Date())), "오늘 호출 수를 읽지 못함");
  const decision = decideAiCall("draft", { changeHasDraft: Boolean(change.draft_response), userCallsToday: 0, serviceCallsToday: today.length });
  if (!decision.allow) return { status: "skipped", reason: decision.reason };
  if (!ai) return { status: "failed", reason: "not_configured" };
  return callAndSave(db, ai, change, input);
}

export async function generateDraft(db: SupabaseClient, ai: AiClient | null, input: Input): Promise<DraftResult> {
  const startedAt = Date.now();
  let result: DraftResult;
  try {
    result = await createDraft(db, ai, input);
  } catch (error) {
    const reason = maskSecrets(error instanceof Error ? error.message : String(error));
    console.error("대응안 초안 만들기 실패(알림은 그대로 만든다)", reason);
    result = { status: "failed", reason };
  }
  if (input.runId && result.status !== "skipped") {
    const step = result.status === "created"
      ? { stepName: "summarize", status: "succeeded" as const, outputSummary: "대응안 초안 만듦", durationMs: Date.now() - startedAt }
      : { stepName: "summarize", status: "failed" as const, errorMessage: result.reason, durationMs: Date.now() - startedAt };
    await recordStep(db, input.runId, step).catch((e) => console.error("summarize 단계를 기록하지 못함", maskSecrets(String(e?.message ?? e))));
  }
  return result;
}
