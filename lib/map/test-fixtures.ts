// 지도 시험이 함께 쓰는 가짜 기술·내 기술(시험 파일끼리 import하면 시험이 두 번 돈다)
import type { CatalogTech, MyTechRow } from "./build-map.ts";

export const NOW = new Date("2026-11-19T00:00:00Z");
export const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
export const tech = (id: string, o: Partial<CatalogTech> = {}): CatalogTech => ({
  id, techKey: `mcp:${id}`, name: id, type: "mcp", hosts: null, categoryId: "small-db", createdAt: ago(30), grade: "pass", gradeReason: null, oneLiner: null, repoUrl: null,
  lastActivityAt: ago(3), lastActivityKind: "release", lastCheckedOkAt: ago(1), collectErrorKind: null, signals: null, ...o,
});
export const mine = (id: string, techId: string | null, o: Partial<MyTechRow> = {}): MyTechRow => ({
  id, techId, manualName: null, projectId: "p1", projectName: "앱", grade: "pass", gradeReason: null, collectErrorKind: null, lastCheckedOkAt: ago(1), ...o,
});
