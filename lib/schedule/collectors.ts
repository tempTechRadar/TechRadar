// 정기 실행·지금 실행이 부르는 수집기 목록. **main에 합쳐진 수집기만** 여기에 올린다.
// 2026-11-18 기준: 합쳐진 것은 npm·PyPI 다운로드(P-9 첫 조각)뿐이다. P-3의 OSV 조회는 사용자 저장소 읽기(first-read) 안에만 있고
// 따로 부를 수 있게 나와 있지 않으며, MCP 레지스트리·GitHub(P-9 나머지)는 아직 합쳐지지 않았다.
// 없는 출처를 "아직 없음"으로 기록하지 않는다(가짜로 칠하지 않음, 불변 6). 수집기가 합쳐질 때마다 여기에 더한다.
import { downloadsCollector } from "../server/collect-downloads.ts";
import type { Collector } from "./run-batch.ts";

export const SCHEDULE_COLLECTORS: Collector[] = [downloadsCollector()];
