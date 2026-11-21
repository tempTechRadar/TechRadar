// 정기 실행·지금 실행이 부르는 수집기 목록. **main에 합쳐진 수집기만** 여기에 올린다.
// 2026-11-18 기준: 합쳐진 것은 정기 OSV 재확인(P-9d)과 npm·PyPI 다운로드(P-9 첫 조각)이고, 이 파일에 공식 MCP 레지스트리(P-9c)와 GitHub 저장소 정보(P-9b)를 더한다.
// 없는 출처를 "아직 없음"으로 기록하지 않는다(가짜로 칠하지 않음, 불변 6). 수집기가 합쳐질 때마다 여기에 더한다.
// 순서가 곧 시간 예산(묶음 240초)을 쓰는 순서다: 새 위험을 알리는 보안 확인(OSV, 몫 150초)을 먼저, 보안 등급의 주의 근거를 채우는 GitHub(몫 60초)를 그다음, 카탈로그(레지스트리, 몫 60초)를 그다음, 인기 신호(다운로드)를 마지막에 둔다.
import { downloadsCollector } from "../server/collect-downloads.ts";
import { githubCollector } from "../server/collect-github.ts";
import { githubSearchCollector } from "../server/collect-github-search.ts";
import { hnCollector } from "../server/collect-hn.ts";
import { osvCollector } from "../server/collect-osv.ts";
import { registryCollector } from "../server/collect-registry.ts";
import type { Collector } from "./run-batch.ts";

export const SCHEDULE_COLLECTORS: Collector[] = [osvCollector(), githubCollector(), githubSearchCollector(), registryCollector(), downloadsCollector(), hnCollector()];
// 갈래 분류(P-12c)는 수집이 아니라 여기 넣지 않는다: 부르는 쪽이 묶음 뒤에 classifyAfterBatch를 부른다(lib/server/classify-store.ts)
