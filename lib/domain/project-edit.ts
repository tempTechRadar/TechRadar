// 프로젝트 이름·메모 고치기 입력 검사(PRD-F4). 네트워크·DB를 모르는 순수 규칙.
// 글자 수는 화면 글자(코드 포인트) 기준이라 이모지 하나가 1이다(사용기 500자와 같은 기준).

export const PROJECT_NAME_MAX = 60;
export const PROJECT_MEMO_MAX = 200;

export type ProjectEditCode = "name" | "name_long" | "memo_long" | "text";
export type ProjectEditCheck = { ok: true; name: string; memo: string | null } | { ok: false; code: ProjectEditCode };

// 줄바꿈·탭·제어 문자(C0·C1)와 보이지 않거나 글 방향을 뒤집는 글자(폭 0 공백, 방향 표시, 줄·문단 구분, BOM). 이모지 이어붙임(U+200D)은 둔다.
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b\u200c\u200e\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
const length = (s: string) => [...s].length;

/** 이름(1~60자)·메모(0~200자, 비면 null). 앞뒤 공백을 떼고 NFC로 맞춘다. 순서: 이름 비었나 → 보이지 않는 글자 → 길이. */
export function checkProjectEdit(input: { name: string; memo: string }): ProjectEditCheck {
  const name = input.name.normalize("NFC").trim();
  const memo = input.memo.normalize("NFC").trim();
  if (!name) return { ok: false, code: "name" };
  if (HIDDEN.test(name) || HIDDEN.test(memo)) return { ok: false, code: "text" };
  if (length(name) > PROJECT_NAME_MAX) return { ok: false, code: "name_long" };
  if (length(memo) > PROJECT_MEMO_MAX) return { ok: false, code: "memo_long" };
  return { ok: true, name, memo: memo || null };
}

// 주소(?error=·?notice=)에는 코드만 싣고 문구는 화면이 여기서 꺼낸다(내 기술 목록의 TECH_ERROR_TEXT와 같은 방식).
// 코드는 서버 함수(lib/server/project-edit.ts)의 ProjectFailCode 앞에 "project_"를 붙인 것이다.
export const PROJECT_ERROR_TEXT: Record<string, string> = {
  project_not_found: "그 프로젝트를 찾지 못했어요. 이미 바뀌었거나 보관한 프로젝트일 수 있어요.",
  project_failed: "저장하지 못했어요. 기존 값은 그대로예요. 잠시 뒤 다시 해 주세요.",
  project_name: "이름을 써 주세요.",
  project_name_long: `이름은 ${PROJECT_NAME_MAX}자까지 쓸 수 있어요.`,
  project_memo_long: `메모는 ${PROJECT_MEMO_MAX}자까지 쓸 수 있어요.`,
  project_text: "이름과 메모에는 줄바꿈이나 보이지 않는 글자를 쓸 수 없어요.",
  project_secret: "비밀번호나 키처럼 보이는 글은 이름·메모에 쓸 수 없어요.",
  archived: "이미 보관한 프로젝트예요. 아래 '보관한 프로젝트'에서 되살려 주세요.",
};
export const PROJECT_NOTICE_TEXT: Record<string, string> = {
  project_edited: "고쳤어요.",
  project_same: "바뀐 것이 없어요.",
  project_archived: "보관했어요. 지우지 않았고, 아래 '보관한 프로젝트'에서 되살릴 수 있어요.",
  project_restored: "되살렸어요. 최신 상태가 궁금하면 '다시 읽기'를 눌러 주세요.",
};
