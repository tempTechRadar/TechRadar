// 기술 한 줄 설명 → 한국어 개요 번역기(P-12r, 서버 전용). 지도에 올릴 공개 목록 기술(map-queries readCatalog) 중 번역이 없거나 원문이 바뀐 줄을
// 20개씩 묶어 Claude 1번 호출로 번역해 technologies.one_liner_ko · one_liner_ko_src(번역한 원문 그대로) · one_liner_ko_at에 쓴다.
// 서비스 키 연결(db)로만 쓴다: technologies 쓰기는 서버. 키(ANTHROPIC_API_KEY)는 어댑터가 읽는다.
// 불변 4: 호출이 실패하거나 답이 이상한 묶음 · 줄은 건너뛰고(있던 번역은 지우지 않음) 다음 실행에 다시 한다. 저장은 "원문이 그대로일 때만"(읽은 뒤 원문이 바뀌면 건너뜀).
// 불변 3: 이미 번역된 줄(원문이 같음)은 다시 부르지 않는다. 상대 경로 import · 파라미터 프로퍼티 없음: `@/` 별칭이 있으면 node가 불러오지 못한다(스크립트에서도 쓴다).
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { buildTranslatePrompt, isTranslatable, needsTranslation, parseTranslateResponse, toBatches, type TranslateRow } from "../ai/translate-one-liners.ts";
import { cleanForLog, maskSecrets } from "../domain/redact.ts";
import { rowsOrThrow } from "./alert-db.ts";
import { chunks, readCatalog, readCategories } from "./map-queries.ts";

const TRANSLATE_MAX_TOKENS = 4096; // 20줄 × (id + 한국어 80자 안팎) — 어댑터 기본 2048은 모자란다
export const MAX_BATCHES_PER_RUN = 30; // 500줄 = 25번 + 여유. 한 번 실행이 이 수를 넘겨 부르지 않는다(비용 상한)

export type TranslateOptions = {
  db: SupabaseClient;
  ai: AiClient | null;
  /** true면 부르기만 하고 DB에 아무것도 쓰지 않는다(technologies · ai_calls 모두). 결과 샘플만 돌려준다 */
  dryRun?: boolean;
  /** 이번에 번역할 줄 수의 위(처음 몇 개만 볼 때). 기본은 전부 */
  limit?: number;
  now?: Date;
};
export type TranslateSample = { id: string; name: string; en: string; ko: string };
export type TranslateResult = {
  status: "not_configured" | "done";
  catalog: number; // 지도 몫 CATALOG_LIMIT 중 읽은 줄
  targets: number; // 번역이 필요한 줄(원문 있음 · 번역 없음 또는 원문이 바뀜)
  tooLong: number; // 원문이 너무 길어 건너뛴 줄(잘라서 번역하지 않음)
  batches: number;
  translated: number;
  dropped: number; // 답에서 버린 줄(id가 안 맞음 · 길이 · 한 줄이 아님 …)
  droppedWhy: string[]; // 못 받은 줄의 이름과 이유(미리 보기에서 품질 확인용)
  failedBatches: number; // 호출 실패 · 답 해석 실패
  saveFailed: number;
  changedSinceRead: number; // 읽은 뒤 원문이 바뀌어 저장하지 않은 줄
  samples: TranslateSample[];
  errors: string[]; // 정리한 오류 문구(키 · 비밀은 가림)
};

export type Row = { id: string; display_name: string; one_liner: string; one_liner_ko: string | null; one_liner_ko_src: string | null };

async function logCall(db: SupabaseClient, row: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("ai_calls").insert({ purpose: "translate", user_id: null, ...row });
  if (error) console.error("ai_calls를 기록하지 못함", maskSecrets(error.message)); // 기록이 안 남아도 번역 결과는 바뀌지 않는다(draft.ts와 같은 규칙)
}

async function readTargets(db: SupabaseClient): Promise<{ catalog: number; rows: Row[] }> {
  const catalog = await readCatalog(db, false, await readCategories(db));
  const ids = catalog.map((t) => t.id);
  const read = await Promise.all(chunks(ids).map(async (c) => rowsOrThrow(await db.from("technologies").select("id, display_name, one_liner, one_liner_ko, one_liner_ko_src").in("id", c), "번역할 기술을 읽지 못함")));
  const byId = new Map(read.flat().map((r) => [r.id as string, r as Row]));
  return { catalog: ids.length, rows: ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) }; // 지도 순서(위험 · 입문 세트 · 새 기술 · 개발 분야 먼저)를 지킨다
}

/** 지도 몫 공개 목록 기술을 읽어 번역한다(운영 한 번 돌리기 · 매일 번역 모두 이 한 곳) */
export async function translateOneLiners(opt: TranslateOptions): Promise<TranslateResult> {
  if (!opt.ai) return { ...emptyResult(), status: "not_configured" }; // 키가 없으면 DB도 읽지 않고 부르지 않는다
  const { catalog, rows } = await readTargets(opt.db);
  return translateRows(opt, rows, catalog);
}

const emptyResult = (): TranslateResult => ({ status: "done", catalog: 0, targets: 0, tooLong: 0, batches: 0, translated: 0, dropped: 0, failedBatches: 0, saveFailed: 0, changedSinceRead: 0, droppedWhy: [], samples: [], errors: [] });

/** 읽어 온 줄 중 번역이 필요한 것을 20개씩 묶어 번역한다(DB 읽기 없음: 시험에서 줄을 직접 넘긴다) */
export async function translateRows(opt: TranslateOptions, rows: Row[], catalog = rows.length): Promise<TranslateResult> {
  const out = emptyResult();
  out.catalog = catalog;
  if (!opt.ai) return { ...out, status: "not_configured" };
  const wanted = rows.filter((r) => needsTranslation(r));
  out.targets = wanted.length;
  const sendable = wanted.filter((r) => isTranslatable(r.one_liner));
  out.tooLong = wanted.length - sendable.length;
  const limited = opt.limit !== undefined ? sendable.slice(0, Math.max(0, opt.limit)) : sendable;
  for (const batch of toBatches(limited).slice(0, MAX_BATCHES_PER_RUN)) await runBatch(opt, batch, out);
  return out;
}

async function runBatch(opt: TranslateOptions, batch: Row[], out: TranslateResult): Promise<void> {
  const sent: TranslateRow[] = batch.map((r) => ({ id: r.id, name: r.display_name, text: r.one_liner }));
  const prompt = buildTranslatePrompt(sent);
  const inputHash = createHash("sha256").update(`${prompt.system}\n${prompt.user}`).digest("hex");
  out.batches++;
  const log = (row: Record<string, unknown>) => (opt.dryRun ? Promise.resolve() : logCall(opt.db, { input_hash: inputHash, ...row }));
  let answer: Awaited<ReturnType<AiClient["complete"]>>;
  try {
    answer = await opt.ai!.complete({ system: prompt.system, user: prompt.user, maxTokens: TRANSLATE_MAX_TOKENS });
  } catch (error) {
    const message = cleanForLog(error instanceof Error ? error.message : String(error)) ?? "호출 실패";
    out.failedBatches++;
    out.errors.push(message);
    await log({ status: "failed", error: message });
    return; // 이 묶음은 건너뛴다: 있던 번역은 그대로, 다음 실행에 다시
  }
  const parsed = parseTranslateResponse(answer.text, sent);
  if (!parsed.ok) {
    out.failedBatches++;
    out.errors.push(parsed.error);
    await log({ tokens_in: answer.tokensIn ?? null, tokens_out: answer.tokensOut ?? null, status: "failed", error: parsed.error });
    return;
  }
  await log({ tokens_in: answer.tokensIn ?? null, tokens_out: answer.tokensOut ?? null, status: "succeeded" });
  out.dropped += sent.length - parsed.translated.length; // 이번에 번역을 못 받은 줄(답에서 빠졌거나 검사에서 버려짐)은 다음 실행에 다시 한다
  const got = new Set(parsed.translated.map((t) => t.id));
  const why = new Map(parsed.dropped.flatMap((d) => (d.id ? [[d.id, d.why] as const] : [])));
  for (const r of sent) if (!got.has(r.id)) out.droppedWhy.push(`${r.name}: ${why.get(r.id) ?? "답에서 빠짐"}`);
  const byId = new Map(batch.map((r) => [r.id, r]));
  for (const t of parsed.translated) await save(opt, byId.get(t.id)!, t.ko, out);
}

async function save(opt: TranslateOptions, row: Row, ko: string, out: TranslateResult): Promise<void> {
  if (opt.dryRun) {
    out.translated++;
    out.samples.push({ id: row.id, name: row.display_name, en: row.one_liner, ko });
    return;
  }
  // 읽은 뒤 원문이 바뀌었으면 건드리지 않는다(.eq("one_liner", 읽은 원문)): 번역한 원문(src)이 늘 그 번역의 원문과 같게
  const { data, error } = await opt.db
    .from("technologies")
    .update({ one_liner_ko: ko, one_liner_ko_src: row.one_liner, one_liner_ko_at: (opt.now ?? new Date()).toISOString() })
    .eq("id", row.id)
    .eq("one_liner", row.one_liner)
    .select("id");
  if (error) {
    out.saveFailed++;
    out.errors.push(`저장하지 못함: ${cleanForLog(error.message) ?? ""}`);
  } else if ((data ?? []).length === 0) out.changedSinceRead++;
  else out.translated++;
}
