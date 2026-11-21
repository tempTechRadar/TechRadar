// 스킬 폴더 위험 패턴 검사의 순수 규칙(SPEC-2 v1, PRD-F6). 네트워크·DB를 모른다. 주인: 김영식 A.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { gradeFromScan, scanRiskPatterns, type RiskGrade, type SourceFile } from "./risk-patterns.ts";
import { SKILLS_DIR } from "./skills.ts";

export const MAX_SKILL_FILES = 20; // 스킬 하나에서 읽는 파일 수. 넘으면 일부만 보고 "통과"라 하지 않게 그 스킬은 수집 오류
export const MAX_SKILL_CHARS = 300_000; // 스킬 하나에서 읽는 글자 수(파일 합). 넘으면 그 스킬은 수집 오류
/** 스킬 등급의 규칙 버전(등급 규칙 칸에 그대로 보인다). OSV 규칙(GRADE_RULE_VERSION)과 따로 올린다 */
export const SKILL_RULE_VERSION = "SPEC-2 v1";

// 그림·글꼴·소리·문서(inert)는 앞부분만 받아 진짜 바이너리(NUL 바이트)면 건너뛰고, 글이면 끝까지 받아 다른 파일처럼 검사한다(scan-skills):
// 확장자로 위장한 스크립트도 검사되고, LFS 포인터처럼 글인 정상 파일은 거짓 경보가 되지 않는다.
// 실행·압축 파일, 목록이 알려 준 내용을 볼 수 없는 항목(링크·서브모듈·너무 긴 경로)은 "못 본 항목"이다(통과로 두지 않게).
// 그 밖은 확장자를 몰라도 읽는다(이름 모를 스크립트를 빼지 않게). 확장자가 목록에 없는 바이너리는 받은 글의 NUL로 다시 가른다(gradeSkill).
const INERT = /\.(png|jpe?g|gif|webp|ico|bmp|svgz|pdf|woff2?|ttf|otf|eot|mp3|mp4|wav|mov|webm)$/i;
const OPAQUE = /\.(zip|gz|tgz|tar|7z|rar|exe|dll|so|dylib|bin|wasm|class|jar|pyc|node)$/i;
export const MAX_SKILL_INERT = 50; // 스킬 하나에서 앞부분을 확인하는 그림 등의 수(글꼴·브랜드 묶음도 들어가게). 넘으면 그 스킬은 수집 오류
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 스킬 폴더 하나(대소문자 무시로 묶음): 실제 폴더 이름들 · 파일 · 내용을 볼 수 없는 항목 */
export type SkillDir = { spellings: string[]; paths: string[]; unseen: string[] };
export type SkillFiles = { paths: string[]; opaque: string[]; inert: string[] };

/**
 * 저장소 파일 목록 → 스킬 폴더별(소문자 이름이 키). 목록을 한 번만 훑는다(스킬마다 전체를 다시 보지 않게).
 * spellings가 2개 이상이면 대소문자만 다른 폴더가 있다(SKILL.md가 없는 폴더 포함): 대소문자를 안 가리는 컴퓨터에서는 한 폴더로 합쳐진다
 */
export function skillDirs(tree: { paths: string[]; unseen: string[] }): Map<string, SkillDir> {
  const root = `${SKILLS_DIR}/`.toLowerCase();
  const dirs = new Map<string, { spellings: Set<string>; paths: string[]; unseen: string[] }>();
  const add = (p: string, into: "paths" | "unseen") => {
    if (!p.toLowerCase().startsWith(root)) return;
    const name = p.slice(root.length).split("/")[0];
    const dir = dirs.get(name.toLowerCase()) ?? { spellings: new Set<string>(), paths: [], unseen: [] };
    dir.spellings.add(name);
    dir[into].push(p);
    dirs.set(name.toLowerCase(), dir);
  };
  for (const p of tree.paths) add(p, "paths");
  for (const p of tree.unseen) add(p, "unseen");
  return new Map([...dirs].map(([k, d]) => [k, { spellings: [...d.spellings].sort(byCode), paths: d.paths, unseen: d.unseen }]));
}

/** 스킬 폴더 하나 → 검사할 파일 · 볼 수 없는 것(opaque) · 앞부분을 볼 그림 등(inert), 이름순. 한도를 넘으면 tooMany(무엇이 넘었는지) */
export function skillFilesOf(dir: SkillDir): SkillFiles | { tooMany: string } {
  const unseen = new Set(dir.unseen);
  const mine = dir.paths.filter((p) => !unseen.has(p)).sort(byCode);
  const inert = mine.filter((p) => INERT.test(p));
  const opaque = [...mine.filter((p) => OPAQUE.test(p)), ...unseen].sort(byCode);
  const paths = mine.filter((p) => !INERT.test(p) && !OPAQUE.test(p));
  if (paths.length > MAX_SKILL_FILES) return { tooMany: `파일이 ${paths.length}개(한도 ${MAX_SKILL_FILES}개)` };
  if (inert.length > MAX_SKILL_INERT) return { tooMany: `그림·글꼴 등이 ${inert.length}개(한도 ${MAX_SKILL_INERT}개)` };
  return { paths, opaque, inert };
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
