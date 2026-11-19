import { test } from "node:test";
import assert from "node:assert/strict";
import { excerptPage, findWikiPages, questionWords, type WikiPage } from "./find-pages.ts";

const pages: WikiPage[] = [
  { path: "wiki/정기-실행.md", title: "정기 실행", text: "# 정기 실행\n매일 06:00(한국 시간)에 수집한다. Hobby라 06:00~06:59 사이에 돈다." },
  { path: "wiki/권한-관리자.md", title: "관리자 권한", text: "# 관리자 권한\n관리자도 본인 알림은 판단할 수 있다. 남의 알림은 못 한다." },
  { path: "wiki/같은-역할.md", title: "같은 역할", text: "# 같은 역할\n확정은 관리자 확인만 한다." },
  { path: "wiki/index.md", title: "목차", text: "# 목차\n- 정기 실행\n- 관리자 권한\n- 같은 역할" },
];

test("질문 낱말에서 조사·물음 끝말을 뗀다", () => {
  assert.deepEqual(questionWords("관리자도 자기 알림에 판단을 저장할 수 있나요?"), ["관리자", "자기", "알림", "판단", "저장할"]);
});

test("조사가 붙은 질문도 맞는 쪽을 찾고, 제목에 맞은 쪽이 앞에 온다", () => {
  const found = findWikiPages("정기 실행은 언제 도나요?", pages);
  assert.equal(found[0].path, "wiki/정기-실행.md");
});

test("관리자 질문은 관리자 권한 쪽이 먼저다(본문만 맞은 쪽보다 제목이 맞은 쪽)", () => {
  const found = findWikiPages("관리자도 알림을 판단할 수 있나요?", pages);
  assert.equal(found[0].path, "wiki/권한-관리자.md");
});

test("맞는 쪽이 없으면 빈 목록(위키에 없습니다)", () => {
  assert.deepEqual(findWikiPages("운영 DB 백업 주기는?", pages), []);
});

test("많이 맞아도 상위 3쪽까지만 넘긴다", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ path: `wiki/p${i}.md`, title: `쪽 ${i}`, text: "관리자 알림 판단" }));
  assert.equal(findWikiPages("관리자 알림 판단", many).length, 3);
});

test("빈 질문이나 한 글자 낱말만 있으면 찾지 않는다", () => {
  assert.deepEqual(findWikiPages("  ", pages), []);
  assert.deepEqual(findWikiPages("a ?", pages), []);
});

test("긴 쪽은 질문 낱말이 든 줄(앞 한 줄·뒤 두 줄 포함)만 뽑아 넘긴다: 뒤쪽에 있는 답도 잘리지 않는다", () => {
  const filler = Array.from({ length: 80 }, (_, i) => `- 상관없는 줄 ${i} 가나다라마바사아자차카타파하`).join("\n");
  const text = `# 데이터 구조\n${filler}\n## 문서끼리 다른 곳\n- 챗봇 하루 20개 한도를 세는 표가 다르다.\n- 문서 A: chat_logs를 센다.\n- 문서 B: ai_calls를 센다.`;
  const out = excerptPage(text, questionWords("챗봇 하루 20개 한도는 어느 표를 세나요?"), 600);
  assert.ok(out.length <= 600, String(out.length));
  assert.match(out, /^# 데이터 구조/);
  assert.match(out, /chat_logs/);
  assert.match(out, /ai_calls/);
  assert.equal(out.includes("상관없는 줄 10 "), false);
});

test("짧은 쪽은 통째로 넘긴다", () => {
  const text = "# 정기 실행\n매일 06:00에 돈다.";
  assert.equal(excerptPage(text, ["정기"], 1800), text);
});

test("맞는 줄이 없으면 앞부분을 넘긴다(제목으로만 찾아진 쪽)", () => {
  const text = `# 제목\n${"가".repeat(3000)}`;
  assert.equal(excerptPage(text, ["없는말"], 500).length <= 500, true);
  assert.match(excerptPage(text, ["없는말"], 500), /^# 제목/);
});
