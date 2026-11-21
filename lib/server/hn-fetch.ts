// Hacker News(Algolia) 읽기 어댑터(P-21b). 주인: 김영식 A. 키 없음. 실패는 수집 오류로 던진다(불변 2: 빈 결과로 단정하지 않음).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { readHits, type HnHit } from "../domain/hn.ts";
import { CollectError, fetchText } from "./collect-fetch.ts";

const WINDOW_SEC = 7 * 24 * 60 * 60; // 상태를 저장하지 않고 늘 최근 7일을 읽는다: 쓰기가 멱등이라 다시 읽어도 안 늘어난다
const MIN_POINTS = 10;
// 한 쪽에 Algolia 한도(1000개)까지: 10점 이상 7일 글이 그보다 많을 일은 없어 다음 쪽은 읽지 않는다
// shortcut: 1000개가 꽉 차면 오래된 글이 잘린다. 그때 nbPages로 다음 쪽을 읽는다

export function hnSearchUrl(keyword: string, nowMs: number): string {
  const since = Math.floor(nowMs / 1000) - WINDOW_SEC;
  const q = new URLSearchParams({ tags: "story", query: keyword, numericFilters: `created_at_i>${since},points>=${MIN_POINTS}`, hitsPerPage: "1000" });
  return `https://hn.algolia.com/api/v1/search_by_date?${q}`;
}

export async function fetchHnHits(keyword: string, nowMs: number): Promise<{ hits: HnHit[]; invalid: number }> {
  const url = hnSearchUrl(keyword, nowMs);
  const text = await fetchText(url);
  if (text === null) throw new CollectError("http_status", `${url}: 404`, 404);
  const read = readHits(text);
  if (!read) throw new CollectError("parse", `${url}: 응답 모양이 달라요(hits 배열 없음)`);
  if (read.hits.length === 0 && read.invalid > 0) throw new CollectError("parse", `${url}: 글 ${read.invalid}개가 모두 칸이 빠졌어요(응답 모양이 바뀜)`); // 빈 결과로 단정하지 않음(불변 2)
  return read;
}
