// 비교 모드(PRD-F42)의 주소 값 ?techs=를 읽는다. DB·화면을 모르는 순수 함수.
// id 모양이 아닌 값은 버린다: 그대로 DB에 보내면 오류가 나고 "불러오지 못함"과 섞이기 때문이다.
import { isUuid } from "../domain/my-tech-view.ts";

type Param = string | string[] | undefined;

export type CompareSelection = { state: "empty" } | { state: "invalid"; message: string } | { state: "ok"; ids: string[] };

const MIN = 2;
const MAX = 3;

export function parseCompareSelection(param: Param): CompareSelection {
  const raw = (Array.isArray(param) ? param : [param ?? ""]).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  if (raw.length === 0) return { state: "empty" };
  const ids = [...new Set(raw.filter(isUuid))];
  if (ids.length < MIN || ids.length > MAX) return { state: "invalid", message: `${MIN}개에서 ${MAX}개까지 골라 주세요.` };
  return { state: "ok", ids };
}
