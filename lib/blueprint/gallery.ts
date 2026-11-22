// 템플릿 갤러리 거르기 · 정렬(P-12f 9 "커뮤니티"): 순수 함수. 분야 = 템플릿에 든 기술의 큰 갈래, 도움 = 그 템플릿 사용기의 "도움이 됐어요" 합.
export type GallerySort = "uses" | "helpful";
export type GalleryFacet = { fields: string[]; helpful: number };
type Item = { id: string; uses: number; createdAt: string };

export const parseSort = (v: unknown): GallerySort => (v === "helpful" ? "helpful" : "uses");

/** 분야로 거르고(그 분야 기술이 하나라도 든 것), 많이 쓴 순(쓴 사람 수 → 새것) 또는 도움 순(도움 합 → 쓴 사람 수 → 새것).
 *  facets = null(못 읽음)이면 거르지 않고 많이 쓴 순: 모르는 것을 "해당 없음"으로 빼지 않는다(불변 2) */
export function arrangeGallery<T extends Item>(list: T[], facets: Map<string, GalleryFacet> | null, opt: { field: string | null; sort: GallerySort }): T[] {
  const f = (t: T) => facets?.get(t.id);
  const shown = facets && opt.field ? list.filter((t) => f(t)?.fields.includes(opt.field!)) : list;
  const helpful = facets && opt.sort === "helpful";
  return [...shown].sort((a, b) => (helpful ? (f(b)?.helpful ?? 0) - (f(a)?.helpful ?? 0) : 0) || b.uses - a.uses || b.createdAt.localeCompare(a.createdAt));
}

/** 거르기 칩: 목록에 나오는 분야와 그 템플릿 수(많은 순 → 이름 순) */
export function galleryFields(facets: Map<string, GalleryFacet>): [string, number][] {
  const n = new Map<string, number>();
  for (const f of facets.values()) for (const x of f.fields) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}
