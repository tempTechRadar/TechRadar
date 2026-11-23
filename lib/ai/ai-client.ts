// Claude를 부르는 자리(P-13). 실제 연결(키·모델·HTTP)은 어댑터 한 파일이 채운다: 그 전에는 null을 넘겨 "만들지 못함"으로 처리한다.
// 도구는 넘기지 않는다(SPEC-9): 글을 주고 글을 받는 것만 한다.
/** maxTokens · timeoutMs: 긴 답이 필요한 호출만 넘긴다(없으면 어댑터 기본값) */
export type AiPrompt = { system: string; user: string; maxTokens?: number; timeoutMs?: number };

export type AiClient = {
  complete(prompt: AiPrompt): Promise<{ text: string; tokensIn?: number; tokensOut?: number }>;
};
