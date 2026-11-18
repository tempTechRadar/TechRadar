// 정기 실행·지금 실행이 부르는 수집기 목록. **main에 합쳐진 수집기만** 여기에 올린다.
// 2026-11-18 기준: 합쳐진 것은 정기 OSV 재확인(P-9d), npm·PyPI 다운로드(P-9 첫 조각), GitHub 저장소 정보(P-9b)다. MCP 레지스트리(P-9c)는
// 아직 합쳐지지 않았다. 없는 출처를 "아직 없음"으로 기록하지 않는다(가짜로 칠하지 않음, 불변 6). 수집기가 합쳐질 때마다 여기에 더한다.
// 순서가 곧 시간 예산(묶음 240초)을 쓰는 순서다: 새 위험을 알리는 보안 확인(OSV)을 먼저 두고, 보안 등급의 주의 근거를 채우는 GitHub(60초 몫)가 그다음이다.
import { downloadsCollector } from "../server/collect-downloads.ts";
import { githubCollector } from "../server/collect-github.ts";
import { osvCollector } from "../server/collect-osv.ts";
import type { Collector } from "./run-batch.ts";

export const SCHEDULE_COLLECTORS: Collector[] = [osvCollector(), githubCollector(), downloadsCollector()];
