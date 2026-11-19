// 별명 규칙(PRD-F1·F34, IA-1·IA-19). DB·화면을 모르는 순수 함수.
// 별명은 다른 사용자에게 "쓰고 있어요"로 보인다: 이메일·구글 표시 이름이 새지 않게 @는 막고, 임시 별명 모양은 쓰지 못하게 한다.
// 길이는 DB 제약(`char_length(nickname) between 2 and 30`)과 같게 글자(코드 포인트) 수로 센다. 중복은 DB 유니크 제약이 최종 판단한다.

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 30;

export type NicknameCheck = { ok: true; nickname: string } | { ok: false; error: string };

const TEMP_SHAPE = /^user-[0-9a-f]{8}$/i;
// 제어 문자(C0·C1)·서식 문자(폭 0 공백, 방향 덮어쓰기)·줄·문단 구분자
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
// 화면에는 빈칸으로 보이는 글자(한글 채움 문자, 점자 빈칸): 이름이 비어 보이거나 이름 뒤에 숨는 데 쓰인다
const INVISIBLE_FILLER = /[\u115f\u1160\u3164\uffa0\u2800]/;

export function validateNickname(raw: string): NicknameCheck {
  // 완성형(NFC)으로 맞춘다: 겉보기가 같은 한글 별명이 자모 분해형으로 중복 등록되는 것을 줄인다(DB 유니크는 글자 그대로 비교)
  const nickname = raw.normalize("NFC").trim();
  const length = [...nickname].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return { ok: false, error: `별명은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 정해 주세요` };
  if (CONTROL_OR_FORMAT.test(nickname)) return { ok: false, error: "별명에 제어 문자·서식 문자(줄바꿈·탭·방향을 바꾸는 글자 등)는 쓸 수 없어요" };
  if (INVISIBLE_FILLER.test(nickname)) return { ok: false, error: "보이는 글자로 정해 주세요(한글 채움 문자·점자 빈칸처럼 보이지 않는 글자는 쓸 수 없어요)" };
  if (nickname.normalize("NFKC").includes("@")) return { ok: false, error: "별명에 @는 쓸 수 없어요(이메일이 다른 사람에게 보이지 않게)" };
  if (TEMP_SHAPE.test(nickname)) return { ok: false, error: "임시 별명 모양(user-과 8자리 숫자·영문)은 쓸 수 없어요" };
  return { ok: true, nickname };
}

/** 가입 트리거가 달아 둔 임시 별명(`user-` + id 앞 8자)인가 */
export const isTempNickname = (nickname: string, userId: string): boolean => nickname === `user-${userId.slice(0, 8)}`;
