import { test } from "node:test";
import assert from "node:assert/strict";
import { logKind, logText, logTime } from "./change-log.ts";
import { putSaid, removeSaid, removedStageSaid, renamedSaid } from "./panel-view.ts";

test("변경 이력 종류(P-12v): 알림 글 낱말로 고르고, 모르면 바꿈", () => {
  assert.equal(logKind(putSaid("개발", "Vite")), "더하기");
  assert.equal(logKind('"배포" 단계를 더했어요.'), "더하기");
  assert.equal(logKind(removeSaid("개발", "Vite")), "빼기");
  assert.equal(logKind(removedStageSaid("개발")), "빼기");
  assert.equal(logKind(renamedSaid("기획")), "이름");
  assert.equal(logKind("기획 → 개발 연결을 이었어요."), "연결");
  assert.equal(logKind('Vite을(를) "개발"에서 "배포"(으)로 옮겼어요.'), "옮김");
  assert.equal(logKind('"준비" 섹션 공통 기술에 Vite을(를) 넣었어요.'), "섹션", "섹션이 넣기보다 먼저");
  assert.equal(logKind('"Vite" → "React" 관계를 표시했어요(내가 그은 표시예요).'), "관계");
  assert.equal(logKind("뭔가 했어요."), "바꿈");
});

test("변경 이력 내용: 되돌리기 안내 문장은 빼고 나머지는 그대로", () => {
  assert.equal(logText(removedStageSaid("개발")), '"개발" 단계를 지웠어요.');
  assert.equal(logText("가이드가 제안한 단계를 판에 새로 넣었어요. 되돌리기로 돌아갈 수 있어요."), "가이드가 제안한 단계를 판에 새로 넣었어요.");
  assert.equal(logText(putSaid("개발", "Vite")), "개발에 Vite을(를) 넣었어요.");
  assert.equal(logTime(new Date(2026, 10, 23, 9, 5, 7).getTime()), "09:05:07", "시각은 두 자리씩");
});
