// 공식 MCP 레지스트리 목록 읽기 어댑터(P-9c, SPEC-8). 실패는 오류 종류로 나눠 던진다. 주인: 김영식 A.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { readRegistryPage, type RegistryPage } from "../domain/registry.ts";
import { CollectError, fetchText } from "./collect-fetch.ts";

export const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";
const PAGE_SIZE = 100;

/** since: 이 시각 이후 바뀐 것만(없으면 전체), cursor: 이어 읽을 다음 쪽 자리(없으면 첫 쪽) */
export type RegistryQuery = { since: string | null; cursor: string | null };

export function registryUrl({ since, cursor }: RegistryQuery): string {
  // version=latest: 서버마다 최신 버전만(안 쓰면 모든 버전이 나와 쪽 수가 두 배 가까이 늘고 첫 전체 읽기가 그만큼 길어진다). 삭제된 최신도 나온다(2026-11-18 확인).
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), version: "latest" });
  if (since) params.set("updated_since", since);
  if (cursor) params.set("cursor", cursor);
  return `${REGISTRY_URL}?${params}`;
}

/** 목록 한 쪽. 못 읽으면 CollectError: "서버가 없다"와 "못 읽음"은 다르다(불변 2). */
export async function fetchRegistryPage(q: RegistryQuery): Promise<RegistryPage> {
  const url = registryUrl(q);
  const text = await fetchText(url);
  if (text === null) throw new CollectError("http_status", `${url}: 404`, 404);
  const page = readRegistryPage(text);
  if (page === null) throw new CollectError("parse", `${url}: 응답의 모양이 달라 해석하지 못함`);
  return page;
}
