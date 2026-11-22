// 추천 고르기(PRD-F32, IA-20): 취향으로 고른 큰 갈래 밑의 기술을 주간 다운로드가 많은 순으로. 순수 함수만(DB 읽기는 lib/server).
// 알림·판단과 따로이고 사건이 아니다. Claude에 넣지 않는다(SPEC).
// shortcut: 인기 신호는 npm·PyPI 주간 다운로드뿐(P-21 HN·HF·별은 아직 없음), 값 없는 기술은 맨 뒤. P-21이 생기면 점수로 바꾼다.
import type { Category } from "../map/build-map.ts";

export type Candidate = {
  id: string; techKey: string; name: string; oneLiner: string | null; categoryId: string | null;
  grade: string; status: string; signals: Record<string, unknown> | null;
};
export type Recommendation = { techId: string; name: string; oneLiner: string | null; reason: string; source: string };

export const DEFAULT_LIMIT = 10;
const EXCLUDED_STATUS = new Set(["deprecated", "gone"]);

const weeklyOf = (t: Candidate): number | null => {
  const v = t.signals?.weekly_downloads;
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null; // 못 읽은 값을 0으로 단정하지 않는다(불변 2)
};
const sourceOf = (techKey: string) => (techKey.startsWith("npm:") ? "npm" : techKey.startsWith("pypi:") ? "PyPI" : "");

export function pickRecommendations(input: { interests: string[]; categories: Category[]; techs: Candidate[]; ownedIds: string[]; limit?: number }): Recommendation[] {
  const { interests, categories, techs, limit = DEFAULT_LIMIT } = input;
  if (!interests.length) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const owned = new Set(input.ownedIds);
  const rows = techs.flatMap((t) => {
    const small = t.categoryId ? byId.get(t.categoryId) : undefined;
    const big = small?.parentId ? byId.get(small.parentId) : small;
    if (!small || !big || !interests.includes(big.name)) return [];
    if (owned.has(t.id) || EXCLUDED_STATUS.has(t.status) || t.grade === "danger") return [];
    const weekly = weeklyOf(t);
    const place = big.id === small.id ? big.name : `${big.name} · ${small.name}`;
    const popularity = weekly === null ? "인기 수치는 아직 없어요" : `주간 다운로드 ${weekly.toLocaleString("en-US")}`;
    return [{ weekly, rec: { techId: t.id, name: t.name, oneLiner: t.oneLiner, reason: `${place} 갈래 · ${popularity}`, source: weekly === null ? "" : sourceOf(t.techKey) } }];
  });
  // 값이 있는 쪽이 먼저, 많은 순. 같으면 이름순(늘 같은 순서)
  rows.sort((a, b) => (b.weekly ?? -1) - (a.weekly ?? -1) || a.rec.name.localeCompare(b.rec.name));
  return rows.slice(0, limit).map((r) => r.rec);
}

// 내 표시(tech_marks, ADR 0028). 추천은 "관심"만 남기고 지운다: 적용 후보·보류는 판단 대기 알림을 판단하므로 기술 상세에서만 정한다.
export type MarkKind = "interest" | "candidate" | "hold";
export type RecommendedItem = Recommendation & { mark: MarkKind | null };
export type MarkUi = { kind: "mark" } | { kind: "interested" } | { kind: "decided"; label: string };

export function markUi(mark: MarkKind | null): MarkUi {
  if (mark === null) return { kind: "mark" };
  if (mark === "interest") return { kind: "interested" };
  return { kind: "decided", label: mark === "candidate" ? "적용 후보" : "보류" };
}
