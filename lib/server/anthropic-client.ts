// Claude(Anthropic Messages API)를 부르는 어댑터(P-13, SPEC-9). 규칙은 lib/ai의 순수 함수가 정하고, 여기서는 글을 주고 글을 받는 일만 한다.
// 주인: 황재웅(B). 이 파일은 김영식이 먼저 채웠고 리뷰는 황재웅이 한다(I-P-13-claude-adapter).
// 키(ANTHROPIC_API_KEY)는 서버 환경변수에서만 읽고 요청 머리글에만 쓴다. 주소·본문·오류 문구에 넣지 않는다(PRD-NF2).
// 도구는 넘기지 않는다(SPEC-9). 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { AiClient } from "../ai/ai-client.ts";
import { maskSecrets } from "../domain/redact.ts";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5-5"; // 비용·품질은 ANTHROPIC_MODEL로 바꾼다(열린 질문, 황재웅이 정함)
const MAX_TOKENS = 2048; // 초안은 1000자 이내 JSON이고, 한국어는 글자당 토큰이 많아 넉넉히 둔다(모자라면 JSON이 잘려 초안이 "만들지 못함"이 된다)
const MAX_TOKENS_CEILING = 8192; // 호출하는 쪽이 올릴 수 있는 한도(maxTokens)의 위
const TIMEOUT_MS = 30_000; // 멈춘 호출이 알림 만들기를 붙잡지 않게(알림은 초안 뒤에 만든다)
const LONG_TIMEOUT_MS = 120_000; // 답이 긴 호출(maxTokens가 기본보다 큼, 번역 묶음 · 서버 일회성 일)만: 기본 30초 안에 못 끝난다
// 헤더 값에 그대로 들어가므로 글자를 좁게 잡는다(줄바꿈·공백·따옴표가 섞이면 fetch가 그 값을 오류 문구에 그대로 되풀이한다)
const KEY_SHAPE = /^[A-Za-z0-9_-]{20,255}$/;
const MODEL_SHAPE = /^[A-Za-z0-9._-]{3,100}$/;
const MAX_ERROR_CHARS = 200;
const MAX_RAW_ERROR_CHARS = 2000; // HTML 오류 쪽처럼 큰 본문을 통째로 다루지 않게

type Env = Record<string, string | undefined>;

/** 키가 없거나 모양이 이상하면 null: 호출하지 않고 draft.ts가 "만들지 못함(not_configured)"으로 남긴다 */
export function createAnthropicClient(env: Env = process.env, fetchImpl: typeof fetch = fetch): AiClient | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!KEY_SHAPE.test(key)) {
    // 키를 넣었는데 조용히 "없음"으로 보이면 원인을 못 찾는다(Vercel 입력란에 따옴표·줄바꿈이 섞이기 쉽다). 값은 적지 않는다
    console.warn("ANTHROPIC_API_KEY의 모양이 이상해 Claude를 부르지 않았어요(공백·줄바꿈·따옴표가 섞였는지 확인, 값은 기록하지 않음)");
    return null;
  }
  const requested = env.ANTHROPIC_MODEL?.trim();
  if (requested && !MODEL_SHAPE.test(requested)) console.warn("ANTHROPIC_MODEL의 모양이 이상해 기본 모델을 써요");
  const model = requested && MODEL_SHAPE.test(requested) ? requested : DEFAULT_MODEL;
  const scrub = (text: string) => maskSecrets(text.split(key).join("[가림]"));
  return {
    async complete({ system, user, maxTokens }) {
      let raw: string;
      let res: Response;
      try {
        res = await fetchImpl(API_URL, {
          method: "POST",
          cache: "no-store",
          headers: { "x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json" },
          body: JSON.stringify({ model, max_tokens: maxTokens && maxTokens > 0 ? Math.min(maxTokens, MAX_TOKENS_CEILING) : MAX_TOKENS, system, messages: [{ role: "user", content: user }] }),
          signal: AbortSignal.timeout(maxTokens && maxTokens > MAX_TOKENS ? LONG_TIMEOUT_MS : TIMEOUT_MS),
        });
        raw = await res.text(); // 시간 제한은 본문 읽기에도 걸린다: 읽다가 끊겨도 "부르지 못함"으로 던진다(빈 설명으로 숨기지 않음)
      } catch (error) {
        throw new Error(`Claude를 부르지 못했어요: ${scrub(error instanceof Error ? error.message : String(error))}`);
      }
      if (!res.ok) throw new Error(`Claude 응답 ${res.status}: ${scrub(describeError(raw)).slice(0, MAX_ERROR_CHARS)}`);
      return readAnswer(raw);
    },
  };
}

/** 오류 본문은 {error:{type,message}} 모양이 보통이다. 아니면 앞부분만 */
function describeError(raw: string): string {
  try {
    const error = (JSON.parse(raw) as { error?: { type?: unknown; message?: unknown } }).error;
    if (error && (typeof error.type === "string" || typeof error.message === "string")) return `${String(error.type ?? "")} ${String(error.message ?? "")}`.trim();
  } catch {
    // JSON이 아니면 아래에서 본문 앞부분을 쓴다
  }
  return raw.slice(0, MAX_RAW_ERROR_CHARS); // 키를 가린 뒤에 MAX_ERROR_CHARS로 자른다(키가 자르는 자리에 걸치지 않게)
}

function readAnswer(raw: string): { text: string; tokensIn?: number; tokensOut?: number } {
  let body: { content?: unknown; stop_reason?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("Claude 답을 해석하지 못했어요(JSON이 아님)");
  }
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  // 길이 한도에서 잘린 답은 JSON이 닫히지 않아 뒤에서 "답이 JSON이 아니에요"로만 남는다: 원인을 여기서 밝힌다
  if (body?.stop_reason === "max_tokens") throw new Error(`Claude 답이 길이 한도에서 잘렸어요(출력 ${count(body.usage?.output_tokens) ?? "?"}토큰)`);
  const blocks = Array.isArray(body?.content) ? (body.content as { type?: unknown; text?: unknown }[]) : [];
  const text = blocks.map((b) => (b?.type === "text" && typeof b.text === "string" ? b.text : "")).join("");
  if (text.trim() === "") throw new Error("Claude에서 글 답이 없어요");
  return { text, tokensIn: count(body.usage?.input_tokens), tokensOut: count(body.usage?.output_tokens) };
}
