// 내 태그(P-12d-my-tech-tags)의 글자 규칙. 네트워크·DB를 모르는 순수 규칙. 주인: 김영식 A.
// 태그는 본인만 보지만, 붙여 넣다 비밀값이 섞이는 일을 막으려고 비밀값 모양은 받지 않는다(서버에서 검사, 화면은 믿지 않음).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { looksSecret } from "../install/validate-item.ts";

export const MAX_TAG_LEN = 30; // DB check와 같은 값
export const MAX_TAGS_PER_TECH = 10; // 기술 하나에 붙이는 내 태그 수
export const MAX_TAG_KINDS = 50; // 한 사람이 쓰는 태그 종류(대소문자 무시)
export const MAX_TAG_ROWS = 1000; // 한 사람의 붙임 합

export type TagCheck = { ok: true; tag: string } | { ok: false; message: string };

/**
 * 같은 태그인지 볼 때의 열쇠: 대소문자를 가리지 않는다(DB의 유일 색인 lower(tag)와 같게).
 * shortcut: JS toLowerCase와 Postgres lower()는 몇 글자(터키어 İ, 끝 시그마 등)에서 다르다. 그때는 DB 유일 색인이 최종 판정이고,
 * 서버는 23505를 "이미 붙어 있음"으로 본다. 그런 태그가 흔해지면 열쇠를 DB에서 받아 쓴다
 */
export const tagKey = (tag: string) => tag.toLowerCase();

/** 입력 → 저장할 태그. 앞뒤 공백을 떼고 안의 연속 공백은 하나로. 빈 글자·30자 초과·줄바꿈 등 제어 문자·비밀값 모양은 거절 */
export function normalizeTag(raw: unknown): TagCheck {
  if (typeof raw !== "string") return { ok: false, message: "태그를 글자로 적어 주세요." };
  // 제어 문자(줄바꿈·탭 포함)는 공백으로 바꾸지 않고 거절한다: 붙여 넣은 여러 줄이 한 태그로 뭉개지지 않게
  if (/[\u0000-\u001f\u007f-\u009f]/.test(raw.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ""))) return { ok: false, message: "태그에는 줄바꿈이나 특수 제어 문자를 넣을 수 없어요." };
  const tag = raw.trim().replace(/ {2,}/g, " ");
  if (tag === "") return { ok: false, message: "태그를 적어 주세요." };
  if ([...tag].length > MAX_TAG_LEN) return { ok: false, message: `태그는 ${MAX_TAG_LEN}자까지예요.` };
  if (looksSecret(tag)) return { ok: false, message: "비밀값처럼 보여서 태그로 남기지 않았어요." };
  return { ok: true, tag };
}
