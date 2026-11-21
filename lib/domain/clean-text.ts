// 믿지 않는 바깥 글(HN 제목·GitHub 저장소 설명)을 DB·화면에 넣을 모양으로 다듬는 한 곳(P-21a·P-21b).
// NUL은 Postgres가 거부해 그 글이 있는 동안 실행이 매번 실패하고, 양방향 제어문자(U+202E 등)는 화면에서 글을 뒤집어 위조할 수 있다.
// 제어문자(C0·C1), 제로폭(U+200B–U+200F, U+2060–U+2064, U+FEFF), 양방향 제어(U+202A–U+202E, U+2066–U+2069)
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

/** 위험한 글자를 빈칸으로 바꾸고 공백을 한 칸으로, 앞뒤 공백을 지운 뒤 max 코드 포인트에서 자른다(대리쌍을 반으로 자르지 않음). ellipsis면 잘렸을 때 끝을 …로 */
export function cleanText(text: string, max: number, ellipsis = false): string {
  const chars = Array.from(text.replace(UNSAFE, " ").replace(/\s+/g, " ").trim());
  if (chars.length <= max) return chars.join("");
  return ellipsis ? `${chars.slice(0, max - 1).join("")}…` : chars.slice(0, max).join("");
}
