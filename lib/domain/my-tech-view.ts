// 내 기술 목록(IA-3)·기술 상세(IA-4) 화면이 쓰는 순수 함수와 문구. 주인: 김영식(A).
import { SKILLS_DIR } from "./skills.ts";
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

export type ReadRun = { status: string; created_at: string };
// shortcut: 읽기 한 번은 서버 한도(maxDuration 300초) 안에 끝나므로 10분 넘게 running이면 멈춘 것으로 본다. 한도를 늘리면 같이 올린다
const STALE_RUN_MINUTES = 10;
const AGAIN = "'다시 읽기'를 눌러 보세요.";

/**
 * 저장소 프로젝트의 마지막 읽기(첫 읽기·다시 읽기) 상태 안내(불변 2: 수집 실패를 "없음"·"전부"로 단정하지 않는다).
 * 잘 읽은 저장소(succeeded)와 저장소를 읽지 않는 칸(local)만 null. 읽은 기록이 없거나 모르는 상태도 "없음"이 아니라 열어 둔다.
 * 실패 원인은 말하지 않는다: failed는 저장소가 안 열린 때만이 아니라 저장 실패 같은 내부 오류로도 남는다.
 * 마지막 읽기는 서버가 정렬해 준 순서가 아니라 created_at으로 고른다.
 */
export function readStatusNotice(kind: "repo" | "local", runs: ReadRun[] | undefined, now: Date): string | null {
  if (kind === "local") return null;
  const last = [...(runs ?? [])].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))[0];
  if (!last) return `이 저장소를 읽은 기록이 없어요. ${AGAIN}`;
  if (last.status === "succeeded") return null;
  if (last.status === "failed") return `마지막 읽기가 실패했어요. 목록이 비었거나 일부만 보일 수 있어요(없다는 뜻이 아니에요). ${AGAIN}`;
  if (last.status === "partial") return `일부 파일을 읽지 못했어요. 아래 목록이 전부가 아닐 수 있어요. ${AGAIN}`;
  if (last.status === "queued" || last.status === "running") {
    const minutes = (now.getTime() - Date.parse(last.created_at)) / 60000;
    return minutes <= STALE_RUN_MINUTES ? `읽기가 아직 끝나지 않았어요. 잠시 뒤 새로 고치거나 ${AGAIN}` : `읽기가 끝나지 않은 채 멈춘 것 같아요. ${AGAIN}`;
  }
  return `읽기 상태를 알 수 없어요. ${AGAIN}`;
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

export type ReadFile = { path: string; count: number; errors: number };
/**
 * 읽은 결과를 파일마다(design.md 18절): 저장소에서 온 내 기술 줄(숨기지 않은 것)을 읽은 파일로 묶어 기술 수와 "확인에 실패한 기술 수"를 센다.
 * 파일을 읽었는지 · 못 읽었는지는 말하지 않는다: 수집 오류 칸은 파일을 못 읽었을 때뿐 아니라 그 기술의 보안 확인이 실패했을 때도 채워지고,
 * 한 기술은 프로젝트에 한 줄이라 마지막에 읽은 파일로만 남기 때문이다(불변 2: 근거 없이 "읽음"이라고 하지 않음).
 * 스킬 폴더(SKILLS_DIR/<이름>)는 폴더 하나로. 직접 추가 · 가져오기 줄은 파일이 없어 뺀다. 확인 실패가 있는 파일 먼저, 그다음 이름순
 */
export function filesOf(techs: { origin: string; source_file: string | null; collect_error_kind: string | null; hidden_at: string | null }[]): ReadFile[] {
  const by = new Map<string, ReadFile>();
  for (const t of techs) {
    if (t.origin !== "repo" || !t.source_file || t.hidden_at) continue;
    const path = t.source_file.startsWith(`${SKILLS_DIR}/`) ? `${SKILLS_DIR}/` : t.source_file;
    const f = by.get(path) ?? { path, count: 0, errors: 0 };
    f.count++;
    if (t.collect_error_kind) f.errors++;
    by.set(path, f);
  }
  return [...by.values()].sort((a, b) => Number(!a.errors) - Number(!b.errors) || a.path.localeCompare(b.path));
}
