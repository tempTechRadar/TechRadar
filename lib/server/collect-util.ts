// 수집기들이 함께 쓰는 작은 도우미. 주인: 김영식 A. 상대 경로 import: `@/` 별칭이 있으면 node --test가 불러오지 못한다.

/** 수집 오류 종류별 개수 글("network 2, timeout 1"). 단계 줄·오류 문구에 쓴다. */
export const countKinds = (failed: { kind: string }[]): string =>
  Object.entries(failed.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {}))
    .map(([kind, n]) => `${kind} ${n}`)
    .join(", ");
