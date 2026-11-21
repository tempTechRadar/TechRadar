/** 메뉴 링크가 지금 화면인지: 하위 주소(/alerts/…)도 그 메뉴로 친다. 로고(/)는 첫 화면일 때만 */
export const isCurrent = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
