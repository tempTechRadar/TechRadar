// 믿지 않는 바깥 글(HN 제목·GitHub 저장소 설명)을 DB·화면에 넣을 모양으로 다듬는 한 곳(P-21a·P-21b).
// NUL은 Postgres가 거부해 그 글이 있는 동안 실행이 매번 실패하고, 양방향 제어문자(U+202E 등)는 화면에서 글을 뒤집어 위조할 수 있다.
// 제어문자(C0·C1), 제로폭 공백(U+200B, U+2060–U+2064, U+FEFF), 양방향 제어(U+061C, U+200E–U+200F, U+202A–U+202E, U+2066–U+2069), 태그 문자(U+E0000–U+E007F).
// ZWNJ(U+200C)·ZWJ(U+200D)는 남긴다: 이모지 시퀀스(사람 + ZWJ + 노트북 같은 조합)와 페르시아어 같은 글이 깨지지 않게
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff\u{e0000}-\u{e007f}]/gu;

/**
 * 위험한 글자를 빈칸으로 바꾸고 공백을 한 칸으로, 앞뒤 공백을 지운 뒤 max 코드 포인트에서 자른다(대리쌍을 반으로 자르지 않음). ellipsis면 잘렸을 때 끝을 …로.
 * 마지막에 짝 없는 대리 문자를 U+FFFD로 바꾼다(toWellFormed): 그런 글은 Postgres가 거부한다
 */
export function cleanText(text: string, max: number, ellipsis = false): string {
  const chars = Array.from(text.replace(UNSAFE, " ").replace(/\s+/g, " ").trim());
  const cut = chars.length <= max ? chars.join("") : ellipsis ? `${chars.slice(0, max - 1).join("")}…` : chars.slice(0, max).join("");
  return cut.toWellFormed();
}
