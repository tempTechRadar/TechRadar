// 정기 실행·지금 실행이 부르는 수집기 목록. **main에 합쳐진 수집기만** 여기에 올린다.
// 2026-11-21 기준 여섯 개다: OSV(P-9d), GitHub 저장소 정보(P-9b), 별 후보 검색(P-21a, ADR 0030), 공식 MCP 레지스트리(P-9c), npm·PyPI 다운로드(P-9), Hacker News(P-21b, ADR 0030).
// 없는 출처를 "아직 없음"으로 기록하지 않는다(가짜로 칠하지 않음, 불변 6). 수집기가 합쳐질 때마다 여기에 더한다.
// 순서가 곧 시간 예산(묶음 240초)을 쓰는 순서다: 새 위험을 알리는 보안 확인(OSV, 몫 150초) → 보안 등급의 주의 근거를 채우는 GitHub(몫 60초) → 별 후보 검색(몫 20초, 짧아서 레지스트리가 아침 시간을 쓰기 전에) → 카탈로그(레지스트리, 몫 60초) → 인기 신호(다운로드) → Hacker News(몫 20초, 마지막). 11-21 운영 정기 실행은 63초(레지스트리 61초)라 예산 안이다. 앞 단계가 길어져 마감이 오면 뒤 수집기는 그 실행에서 시작하지 않는다(runBatch가 건너뜀, 회색으로 남음).
import { downloadsCollector } from "../server/collect-downloads.ts";
import { githubCollector } from "../server/collect-github.ts";
import { githubSearchCollector } from "../server/collect-github-search.ts";
import { hnCollector } from "../server/collect-hn.ts";
import { osvCollector } from "../server/collect-osv.ts";
import { registryCollector } from "../server/collect-registry.ts";
import type { Collector } from "./run-batch.ts";

export const SCHEDULE_COLLECTORS: Collector[] = [osvCollector(), githubCollector(), githubSearchCollector(), registryCollector(), downloadsCollector(), hnCollector()];
// 갈래 분류(P-12c)는 수집이 아니라 여기 넣지 않는다: 부르는 쪽이 묶음 뒤에 classifyAfterBatch를 부른다(lib/server/classify-store.ts)
