// 정기 실행·지금 실행이 부르는 수집기 목록. **main에 합쳐진 수집기만** 여기에 올린다.
// 2026-11-18 기준: P-3의 OSV 조회는 사용자 저장소 읽기(first-read) 안에만 있고 따로 부를 수 있게 나와 있지 않으며,
// P-9(MCP 레지스트리·GitHub·다운로드)는 아직 합쳐지지 않았다. 그래서 비어 있다.
// 없는 출처를 "아직 없음"으로 기록하지 않는다(가짜로 칠하지 않음, 불변 6). P-9가 합쳐지면 그 수집기를 여기에 더한다.
import type { Collector } from "./run-batch.ts";

export const SCHEDULE_COLLECTORS: Collector[] = [];
