// 믿지 않는 바깥 글(HN 제목·GitHub 저장소 설명)을 DB·화면에 넣을 모양으로 다듬는 한 곳(P-21a·P-21b).
// NUL은 Postgres가 거부해 그 글이 있는 동안 실행이 매번 실패하고, 양방향 제어문자(U+202E 등)는 화면에서 글을 뒤집어 위조할 수 있다.
// 제어문자(C0·C1), 보이지 않는 글자(U+00AD 소프트 하이픈, U+180E, U+200B, U+2060–U+2064, U+FEFF, U+FFF9–U+FFFB 주석 표시, U+E0100–U+E01EF 변이 선택자 보충),
// 양방향 제어(U+061C, U+200E–U+200F, U+202A–U+202E, U+2066–U+2069), 태그 문자(U+E0000–U+E007F). 이모지에 쓰이는 U+FE0F는 남긴다.
// ZWNJ(U+200C)·ZWJ(U+200D)는 남긴다: 이모지 시퀀스(사람 + ZWJ + 노트북 같은 조합)와 페르시아어 같은 글이 깨지지 않게
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff\ufff9-\ufffb\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/gu;

/**
 * 위험한 글자를 빈칸으로 바꾸고 공백을 한 칸으로, 앞뒤 공백을 지운 뒤 max 코드 포인트에서 자른다(대리쌍을 반으로 자르지 않음). ellipsis면 잘렸을 때 끝을 …로.
 * 잘린 끝에 매달린 ZWJ는 뗀다(이모지 시퀀스를 자르면 "사람 + ZWJ + …"처럼 남는다). 마지막에 짝 없는 대리 문자를 U+FFFD로 바꾼다(toWellFormed): 그런 글은 Postgres가 거부한다
 */
export function cleanText(text: string, max: number, ellipsis = false): string {
  const chars = Array.from(text.replace(UNSAFE, " ").replace(/\s+/g, " ").trim());
  if (chars.length <= max) return chars.join("").toWellFormed();
  const kept = chars.slice(0, ellipsis ? max - 1 : max);
  while (kept.at(-1) === "\u200d") kept.pop();
  return `${kept.join("")}${ellipsis ? "…" : ""}`.toWellFormed();
}
