// 청사진 서랍의 "지도 전체"(P-12o, 11-23 사용자: 담은 기술 · 관심 · 사용 중만 말고 지도 기술도 다): 지도 손님 목록(공개 칸만, map-queries readGuestMapInput)을
// 서랍 카드 모양(PoolTech)으로 바꾼다. 이미 내 서랍에 있는 기술은 빼서 두 번 보이지 않게. DB · 화면을 모르는 순수 함수
import { categoryNames, UNSORTED, type CatalogTech, type Category } from "../map/build-map.ts";
import type { PoolTech } from "../server/blueprints.ts";

export function catalogToPool(techs: CatalogTech[], categories: Category[], have: Iterable<string> = []): PoolTech[] {
  const cats = new Map(categories.map((c) => [c.id, c])), skip = new Set(have);
  return techs.filter((t) => !skip.has(t.id)).map((t) => {
    const { field, sub } = categoryNames(t.categoryId, cats);
    return { id: t.id, name: t.name, type: t.type, grade: t.grade, field: field === UNSORTED ? null : field, sub: sub === UNSORTED ? null : sub,
      oneLiner: t.oneLiner, projects: 0, mark: null, collectError: !!t.collectErrorKind };
  });
}
