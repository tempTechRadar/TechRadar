// GitHub 주제 태그 검색 어댑터(P-21a, ADR 0033, data-sources 0-1). 실패는 오류 종류로 나눠 던진다. 주인: 김영식 A.
// 토큰은 요청 머리글에만 쓰고 주소·오류 문구에 넣지 않는다(비밀값은 서버 환경변수에만, PRD-NF2).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { MIN_STARS, readSearchPage, type SearchPage, type SearchTag } from "../domain/star-candidates.ts";
import { CollectError, fetchText } from "./collect-fetch.ts";

export const PER_PAGE = 100;
// 검색 응답은 저장소 한 건이 7KB 안팎이라 100건이면 70만 자에 가깝다(11-21 실측 673,697자). fetchText의 기본 한도(50만 자)로는 첫 쪽부터 막힌다
const MAX_SEARCH_TEXT = 2_000_000;
/** upper: 별 상한(검색 한 번에 1,000건까지라 넘으면 앞에서 본 가장 적은 별 수로 구간을 좁혀 이어 읽는다). null이면 하한만 */
export type SearchQuery = { tag: SearchTag; upper: number | null; page: number };

export function searchUrl(q: SearchQuery): string {
  const stars = q.upper === null ? `>=${MIN_STARS}` : `${MIN_STARS}..${q.upper}`;
  return `https://api.github.com/search/repositories?q=${encodeURIComponent(`topic:${q.tag} stars:${stars}`)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${q.page}`;
}

/**
 * 검색 한 쪽. 404·모양이 다른 응답은 "후보 없음"이 아니라 수집 오류(불변 2). 403·429·422는 fetchText가 던진다.
 * GitHub가 "결과가 다 안 나왔다"고 한 쪽(incomplete_results)은 던지지 않고 incomplete로 돌려준다: 다시 읽을지·건너뛸지는 수집기가 정한다
 */
export async function fetchSearchPage(q: SearchQuery, token: string): Promise<SearchPage> {
  const url = searchUrl(q);
  const text = await fetchText(url, {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "TechRadar-collector" },
  }, MAX_SEARCH_TEXT);
  if (text === null) throw new CollectError("http_status", `${url}: 404`, 404);
  const page = readSearchPage(text);
  if (page === null) throw new CollectError("parse", `${url}: 응답의 모양이 달라 해석하지 못함`);
  return page;
}
