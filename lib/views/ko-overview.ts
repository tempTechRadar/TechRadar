// 기술 한 줄 설명을 한국어 개요로 먼저 보일지 고른다(P-12r). 화면을 모르는 순수 함수.
// 옛 번역 거르기(원문이 번역 뒤에 바뀜)는 서버가 koOf로 이미 한다: 여기 오는 oneLinerKo는 지금 원문을 번역한 것만.
export type KoOverview = { ko: string; original: string | null; source: string | null };

/** 한국어 개요가 있으면 [원문 보기]에 쓸 영어 원문 · 출처와 함께, 없으면 null(화면은 지금처럼) */
export function koOverview(t: { oneLiner?: string | null; oneLinerKo?: string | null; oneLinerSource?: string | null }): KoOverview | null {
  const ko = t.oneLinerKo?.trim();
  if (!ko) return null;
  const source = t.oneLinerSource && /^https?:\/\//i.test(t.oneLinerSource) ? t.oneLinerSource : null; // DB 글이라 링크는 http(s)만
  return { ko, original: t.oneLiner?.trim() || null, source };
}
