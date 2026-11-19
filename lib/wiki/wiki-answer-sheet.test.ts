import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildChatPrompt } from "../ai/build-chat-prompt.ts";
import { readWikiPages } from "../server/wiki-pages.ts";
import { findWikiPages } from "./find-pages.ts";

// docs/wiki-chat.md 정답표 Q1–Q5를 실제 wiki/로 돌린다(Claude 호출 전 단계). 위키 쪽 이름이나 내용이 바뀌면 여기서 먼저 깨진다.
// 운영 11-19: Q5가 "위키에 없습니다" — 쪽은 맞게 찾았지만 쪽마다 앞 2000자만 넘겨 "문서끼리 다른 곳"(뒤쪽)이 잘렸다.
const pages = readWikiPages(fileURLToPath(new URL("../..", import.meta.url)));

const SHEET: { q: string; page: string; mustSee: RegExp[] }[] = [
  { q: "정기 실행은 언제 도나요?", page: "wiki/수집과-정기-실행.md", mustSee: [/06:00/, /06:59/] },
  { q: "관리자도 자기 알림에 판단을 저장할 수 있나요?", page: "wiki/판단과-알림.md", mustSee: [/남의 알림/] },
  { q: "\"같은 역할\" 관계는 어떻게 확정되나요?", page: "wiki/결정-기록.md", mustSee: [/관리자 확인으로만/] },
  { q: "운영 Supabase DB는 얼마나 자주 백업하나요?", page: "wiki/용어.md", mustSee: [/백업 주기는 정해져 있지 않다/] },
  { q: "챗봇 \"한 사람 하루 20개\" 한도는 어느 표를 세서 거나요?", page: "wiki/데이터-구조.md", mustSee: [/chat_logs/, /ai_calls/, /문서 A/, /문서 B/] },
];

for (const [i, row] of SHEET.entries()) {
  test(`정답표 Q${i + 1}: 의도한 쪽이 상위 3에 들고, Claude에 넘기는 글에 답의 근거가 들어 있다`, () => {
    const found = findWikiPages(row.q, pages);
    assert.ok(found.some((p) => p.path === row.page), `상위 3: ${found.map((p) => p.path).join(", ")}`);
    const prompt = buildChatPrompt(row.q, found);
    const block = prompt.user.split("<자료 ").find((b) => b.startsWith(`출처="${row.page}"`)) ?? "";
    for (const re of row.mustSee) assert.match(block, re);
  });
}

test("정답표 Q5: 충돌을 적은 두 쪽이 모두 상위 3에 든다", () => {
  const found = findWikiPages("챗봇 \"한 사람 하루 20개\" 한도는 어느 표를 세서 거나요?", pages).map((p) => p.path);
  assert.ok(found.includes("wiki/데이터-구조.md") && found.includes("wiki/품질-요구와-AI-사용.md"), found.join(", "));
});

// 11-19 재확인(I-qa-c-q5-recheck): 위 Q5 시험은 데이터-구조 한 쪽의 근거만 본다. 충돌을 적은 두 쪽 모두에서 양쪽 근거가 넘어가는지도 본다(CLAUDE.md 4절).
// 고치기 전 방식(쪽 앞 2000자)이면 두 쪽 모두 "문서끼리 다른 곳"이 2000자 뒤(데이터-구조 4174자째, 품질 2979자째)라 잘린다.
test("정답표 Q5: 충돌을 적은 두 쪽 모두, Claude에 넘기는 글에 양쪽 근거(chat_logs·ai_calls, 문서 A·B)가 들어 있다", () => {
  const q = "챗봇 \"한 사람 하루 20개\" 한도는 어느 표를 세서 거나요?";
  const prompt = buildChatPrompt(q, findWikiPages(q, pages));
  for (const page of ["wiki/데이터-구조.md", "wiki/품질-요구와-AI-사용.md"]) {
    const block = prompt.user.split("<자료 ").find((b) => b.startsWith(`출처="${page}"`)) ?? "";
    for (const re of [/chat_logs/, /ai_calls/, /문서 A/, /문서 B/]) assert.match(block, re, `${page}: ${re}`);
  }
});
