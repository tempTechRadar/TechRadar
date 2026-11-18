// 갤러리(PRD-F36): 내 기술을 카드로. 표와 같은 데이터·같은 거르기(등급). 본인 데이터만 쓰는 순수 함수.

export type Grade = "pass" | "caution" | "danger" | "unknown";
export type GalleryRow = {
  id: string;
  name: string;
  version: string | null;
  grade: Grade;
  gradeReason: string | null;
  collectErrorKind: string | null;
  lastCheckedOkAt: string | null;
  projectName: string;
};
export type Card = GalleryRow & { gradeKo: string; note: string };

export const GRADE_KO: Record<Grade, string> = { danger: "위험", caution: "주의", pass: "통과", unknown: "찾지 못함" };
const GRADE_RANK: Record<Grade, number> = { danger: 0, caution: 1, unknown: 2, pass: 3 };

/** 수집 오류는 "통과"나 "없음"으로 보이지 않게 따로 적는다(불변 2) */
function noteOf(r: GalleryRow): string {
  if (r.collectErrorKind) return "수집 오류: 마지막으로 확인한 등급이에요";
  return r.gradeReason ?? "";
}

/** 등급 거르기(비우면 전부) 뒤 위험부터, 같은 등급은 이름순. 같은 기술이 여러 프로젝트에 있으면 카드도 여러 장(프로젝트 이름으로 구분) */
export function galleryCards(rows: GalleryRow[], grades: Grade[] = []): Card[] {
  return rows
    .filter((r) => grades.length === 0 || grades.includes(r.grade))
    .map((r) => ({ ...r, gradeKo: GRADE_KO[r.grade], note: noteOf(r) }))
    .sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || a.name.localeCompare(b.name) || a.projectName.localeCompare(b.projectName) || (a.id < b.id ? -1 : 1));
}
