// 내 기술 목록(IA-3)·기술 상세(IA-4) 화면이 쓰는 순수 함수와 문구. 주인: 김영식(A).
import type { Grade } from "./grade.ts";

export const GRADE_LABEL: Record<Grade, string> = { danger: "위험", caution: "주의", pass: "통과", unknown: "찾지 못함" };
// 배지 모양(색)은 alerts.css의 badge-* 이름을 따른다. 색만으로 알리지 않도록 글자(GRADE_LABEL)가 항상 함께 나온다.
export const GRADE_TONE: Record<Grade, string> = { danger: "danger", caution: "warning", pass: "success", unknown: "neutral" };
export const ORIGIN_LABEL: Record<string, string> = { repo: "저장소에서 읽음", manual: "직접 추가", import: "내 컴퓨터 목록 가져오기" };
export const GRADE_OPTIONS: [string, string][] = [["", "전체"], ["danger", "위험"], ["caution", "주의"], ["pass", "통과"], ["unknown", "찾지 못함"]];

export const COLLECT_ERROR_TEXT: Record<string, string> = {
  timeout: "응답이 늦어 시간이 지났어요",
  network: "연결하지 못했어요",
  rate_limited: "요청 한도에 걸렸어요",
  http_status: "서버가 오류로 답했어요",
  parse: "내용을 읽지 못했어요",
};

/** 화면에 보이는 실패 문구. 주소에는 코드만 싣고 글은 여기서만 꺼낸다(주소로 문구를 바꿔 끼우지 못하게). */
export const TECH_ERROR_TEXT: Record<string, string> = {
  not_found: "내 기술 목록에서 찾을 수 없어요.",
  failed: "저장하지 못했어요. 아무것도 바뀌지 않았어요. 잠시 뒤 다시 해 주세요.",
  duplicate: "이미 이 프로젝트 목록에 있어요. 숨겨 둔 기술이면 '숨긴 기술도 보기'에서 되돌려 주세요.",
  no_target: "목록에서 기술을 고르거나 이름을 써 주세요.",
  name: "이름은 80자 안으로 써 주세요.",
  secret: "비밀값처럼 보여서 저장하지 않았어요. 기술 이름만 써 주세요.",
  version: "버전은 숫자·글자·. + - 만 써서 40자 안으로 써 주세요.",
  project: "프로젝트를 고를 수 없어요.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

export type TechFilter = { grade?: string; showHidden?: boolean };

/** 숨긴 기술은 기본으로 빼고, 등급을 고르면 그 등급만 */
export function filterTechs<T extends { grade: string; hidden_at: string | null }>(techs: T[], f: TechFilter): T[] {
  return techs.filter((t) => (f.showHidden || !t.hidden_at) && (!f.grade || t.grade === f.grade));
}

/**
 * 카탈로그 검색어. 글자·숫자·공백과 `- _ . : @ /`만 남겨, 거르기 문법(`,` `(` `)` `%`)이 끼어들지 못하게 한다.
 * 두 글자 미만이면 검색하지 않는다(null).
 */
export function searchTerm(raw: string): string | null {
  const term = raw.replace(/[^\p{L}\p{N} ._:@/-]/gu, "").trim().slice(0, 50);
  return term.length >= 2 ? term : null;
}

/**
 * 거르기·검색 상태를 주소 글(?뒤)로 다시 만든다. 값은 모두 검사해서 쓰므로, 폼에 실려 온 글을 그대로 믿지 않는다.
 * 숨기기·추가 뒤에 보던 화면으로 돌아가고, 거르기 폼과 검색 폼이 서로의 상태를 지우지 않게 하는 데 쓴다.
 */
export function keepView(q: { grade?: string; project?: string; hidden?: string; q?: string }): string {
  const p = new URLSearchParams();
  if (q.grade && Object.hasOwn(GRADE_LABEL, q.grade)) p.set("grade", q.grade);
  if (q.project && isUuid(q.project)) p.set("project", q.project);
  if (q.hidden === "1") p.set("hidden", "1");
  const term = searchTerm(q.q ?? "");
  if (term) p.set("q", term);
  return p.toString();
}

export type EvidenceLink = { id: string; severity: string | null; fixed: string | null; url: string | null };
const OSV_URL = "https://osv.dev/vulnerability/";
const textOr = (v: unknown) => (typeof v === "string" ? v : null);

/** 등급 근거(grade_evidence)에서 보여 줄 줄만. 링크는 OSV 주소만 살리고 다른 주소는 버린다(저장된 글을 그대로 믿지 않음). */
export function evidenceLinks(raw: unknown): EvidenceLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e: Record<string, unknown> | null) => {
    if (!e || typeof e.id !== "string") return [];
    const url = textOr(e.url);
    return [{ id: e.id, severity: textOr(e.severity), fixed: textOr(e.fixed), url: url?.startsWith(OSV_URL) ? url : null }];
  });
}
