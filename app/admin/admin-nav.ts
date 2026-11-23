// 관리자 왼쪽 메뉴의 묶음(11-23 관리자 리뉴얼, docs/quality-loop/README.md "관리자 화면 리뉴얼" 2항). 주소는 하나도 바꾸지 않고 묶기만 한다.
// 순수 함수라 lib/admin/admin-nav.test.ts가 돌린다(JSX · next 가져오기 없음). 메뉴 항목(ADMIN_TABS)은 admin-shell.tsx에 있다.

export type NavTab = { id: string; href: string; label: string };
export type NavGroupSpec = { id: string; label: string; note?: string; items: readonly string[] };
export type NavGroup<T extends NavTab = NavTab> = { id: string; label: string; note?: string; items: T[] };

export const ADMIN_GROUPS: readonly NavGroupSpec[] = [
  { id: "watch", label: "지켜보기", note: "자동", items: ["runs", "run-now", "observations", "flow"] },
  { id: "human", label: "사람 판단 현황", items: ["alerts", "reports"] },
  { id: "ops", label: "운영 관리", note: "고치면 기록이 남음", items: ["members", "classify"] },
  { id: "demo", label: "시연과 지식", items: ["simulator", "demo", "chat"] },
];

/** 묶음 이름(메모 포함) 한 줄: "운영 관리(고치면 기록이 남음)" */
export const groupTitle = (g: { label: string; note?: string }) => (g.note ? `${g.label}(${g.note})` : g.label);

/**
 * 메뉴 항목을 묶음 순서대로 나눈다. 묶음에 적힌 id 중 메뉴에 없는 것은 건너뛰고(빈 묶음은 뺌),
 * 어느 묶음에도 없는 항목은 "그 밖" 묶음으로 끝에 모은다: 새 탭을 더하고 묶음을 깜빡해도 메뉴에서 사라지지 않게.
 */
export function groupTabs<T extends NavTab>(tabs: readonly T[], groups: readonly NavGroupSpec[] = ADMIN_GROUPS): NavGroup<T>[] {
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const used = new Set<string>();
  const out: NavGroup<T>[] = [];
  for (const g of groups) {
    const items = g.items.flatMap((id) => {
      const t = byId.get(id);
      if (!t || used.has(id)) return [];
      used.add(id);
      return [t];
    });
    if (items.length > 0) out.push({ id: g.id, label: g.label, note: g.note, items });
  }
  const rest = tabs.filter((t) => !used.has(t.id));
  if (rest.length > 0) out.push({ id: "other", label: "그 밖", items: rest });
  return out;
}

/** 본문 머리의 작은 묶음 이름. 첫 화면("")이나 모르는 탭은 "관리자" */
export function groupLabelOf(tab: string, groups: readonly NavGroupSpec[] = ADMIN_GROUPS): string {
  const g = groups.find((x) => x.items.includes(tab));
  return g ? groupTitle(g) : "관리자";
}
