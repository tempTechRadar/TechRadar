// 스킬 폴더 위험 패턴 검사의 순수 규칙(SPEC-2 v1, PRD-F6). 네트워크·DB를 모른다. 주인: 김영식 A.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { gradeFromScan, scanRiskPatterns, type RiskGrade, type SourceFile } from "./risk-patterns.ts";
import { SKILLS_DIR } from "./skills.ts";

export const MAX_SKILL_FILES = 20; // 스킬 하나에서 읽는 파일 수. 넘으면 일부만 보고 "통과"라 하지 않게 그 스킬은 수집 오류
export const MAX_SKILL_CHARS = 300_000; // 스킬 하나에서 읽는 글자 수(파일 합). 넘으면 그 스킬은 수집 오류
/** 스킬 등급의 규칙 버전(등급 규칙 칸에 그대로 보인다). OSV 규칙(GRADE_RULE_VERSION)과 따로 올린다 */
export const SKILL_RULE_VERSION = "SPEC-2 v1";

// 그림·글꼴·소리·문서는 실행되지 않아 건너뛴다. 실행·압축 파일은 글로 검사할 수 없으니 "못 본 파일"로 센다(통과로 두지 않게).
// 그 밖은 확장자를 몰라도 읽는다(이름 모를 스크립트를 빼지 않게).
// 확장자가 목록에 없는 바이너리는 받은 글에 NUL 문자가 있는지로 다시 가른다(gradeSkill). 심볼릭 링크는 파일 목록의 mode로 가른다.
// shortcut: 300자 넘는 경로는 파일 목록(codeFilesOf)에서 이미 빠져 보지 못한다. 드물어 그대로 둔다
const INERT = /\.(png|jpe?g|gif|webp|ico|bmp|svgz|pdf|woff2?|ttf|otf|eot|mp3|mp4|wav|mov|webm)$/i;
const OPAQUE = /\.(zip|gz|tgz|tar|7z|rar|exe|dll|so|dylib|bin|wasm|class|jar|pyc|node)$/i;
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 저장소 파일 경로 → 이 스킬 폴더(하위 폴더 포함)에서 검사할 파일(이름순)과 글로 검사할 수 없는 파일. 검사할 파일이 한도를 넘으면 tooMany */
export function skillFilesOf(tree: { paths: string[]; links: string[] }, folder: string): { paths: string[]; opaque: string[] } | { tooMany: number } {
  const prefix = `${SKILLS_DIR}/${folder}/`;
  const links = new Set(tree.links);
  const unseen = (p: string) => OPAQUE.test(p) || links.has(p);
  const mine = tree.paths.filter((p) => p.startsWith(prefix) && !INERT.test(p)).sort(byCode);
  const paths = mine.filter((p) => !unseen(p));
  return paths.length > MAX_SKILL_FILES ? { tooMany: paths.length } : { paths, opaque: mine.filter(unseen) };
}

/** 등급 근거(grade_evidence): 화면·다른 단계가 읽는 {id, severity, fixed} 모양으로. id = "패턴 · 파일:줄" */
export type SkillEvidence = { id: string; severity: "위험" | "주의"; fixed: null };

/**
 * 읽은 파일 → 등급(gradeFromScan 그대로: 읽은 파일 0개·검사 못 한 긴 줄이면 찾지 못함)과 근거.
 * 글에 NUL 문자가 있는 파일은 바이너리라 검사하지 않고 binary로 돌려준다. skippedLines = 너무 길어 검사하지 못한 줄 수
 */
export function gradeSkill(files: SourceFile[]): RiskGrade & { evidence: SkillEvidence[]; skippedLines: number; binary: string[] } {
  const text = files.filter((f) => !f.text.includes("\u0000"));
  const scan = scanRiskPatterns(text);
  const r = gradeFromScan(scan, text.length);
  const binary = files.filter((f) => f.text.includes("\u0000")).map((f) => f.path);
  const evidence = r.findings.map((f) => ({ id: `${f.pattern} · ${f.file}:${f.line}`, severity: f.grade === "danger" ? "위험" as const : "주의" as const, fixed: null }));
  return { ...r, evidence, skippedLines: scan.skippedLines, binary };
}
