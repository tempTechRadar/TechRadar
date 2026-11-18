// GitHub 저장소 정보 읽기 어댑터(P-9b, SPEC-8). 실패는 오류 종류로 나눠 던진다. 주인: 김영식 A.
// 토큰은 요청 머리글에만 쓰고 주소·오류 문구에 넣지 않는다(비밀값은 서버 환경변수에만, PRD-NF2).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { readRepoInfo, repoApiUrl, type RepoInfo, type RepoRef } from "../domain/github-repo.ts";
import { CollectError, fetchText } from "./collect-fetch.ts";

/** 저장소 정보 하나. 404는 null(찾을 수 없음: 없는 저장소거나 비공개). 못 읽은 것(한도 초과·연결·모양)은 CollectError: "없다"와 "못 읽음"은 다르다(불변 2). */
export async function fetchRepoInfo(ref: RepoRef, token: string): Promise<RepoInfo | null> {
  const url = repoApiUrl(ref);
  const text = await fetchText(url, {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "TechRadar-collector" },
  });
  if (text === null) return null;
  const info = readRepoInfo(text);
  if (info === null) throw new CollectError("parse", `${url}: 응답의 모양이 달라 해석하지 못함`);
  return info;
}
