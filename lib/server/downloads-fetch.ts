// npm·PyPI 주간 다운로드 읽기 어댑터(P-9, SPEC-8). 실패는 오류 종류로 나눠 던진다. 주인: 김영식 A.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { downloadsUrl, readNpmWeekly, readPypiWeekly, type PackageRef } from "../domain/downloads.ts";
import { CollectError, fetchText } from "./collect-fetch.ts";

/** 지난 7일 다운로드 수. 못 읽으면 CollectError: 0과 "못 읽음"은 다르다(불변 2). */
export async function fetchWeeklyDownloads(ref: PackageRef): Promise<number> {
  const url = downloadsUrl(ref);
  const text = await fetchText(url);
  // 404는 다운로드가 0이라는 뜻이 아니라 패키지를 못 찾았다는 뜻이다
  if (text === null) throw new CollectError("http_status", `${url}: 404`, 404);
  const count = ref.ecosystem === "npm" ? readNpmWeekly(text) : readPypiWeekly(text);
  if (count === null) throw new CollectError("parse", `${url}: 응답의 모양이 달라 해석하지 못함`);
  return count;
}
