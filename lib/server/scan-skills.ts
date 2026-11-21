// 첫 읽기의 스킬 위험 패턴 검사(SPEC-2, PRD-F6). 주인: 김영식 A.
// 파일 목록은 코드 읽기(read-models)가 이미 받은 트리를 쓰고, SKILL.md는 스킬 읽기가 받은 글을 쓴다: GitHub API 호출을 늘리지 않고, 나머지 파일만 raw로 받는다.
// 못 읽은 것·한도를 넘은 것·다 검사하지 못한 것은 그 스킬만 수집 오류다. 일부만 보고 "통과"·"확인함"이라 하지 않는다(불변 2).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { FoundTech } from "../domain/manifest.ts";
import type { SourceFile } from "../domain/risk-patterns.ts";
import { MAX_SKILL_CHARS, gradeSkill, skillDirs, skillFilesOf, type SkillFiles } from "../domain/skill-scan.ts";
import { SKILLS_DIR } from "../domain/skills.ts";
import { CollectError, errorKindOf, fetchText, messageOf, rawFileUrl, type ErrorKind } from "./collect-fetch.ts";

export const SCAN_BUDGET_MS = 20_000; // 스킬 검사 시간 몫: 마지막 묶음이 시간 제한(10초)까지 걸려도 30초 안
export const MAX_SCAN_FILES = 200; // 한 번 읽기에서 raw로 끝까지 받는 스킬 파일 수 합
export const MAX_SCAN_HEADS = 300; // 한 번 읽기에서 앞부분(512바이트)만 받는 그림 등의 수 합(가벼운 요청이라 따로 센다)
const BATCH_FILES = 20; // 동시에 여는 요청 수: 100개를 동시에 열면 GitHub raw가 끊는다
const HEAD_BYTES = 512; // 진짜 그림·글꼴·소리는 앞 512바이트 안에 NUL 바이트가 있다

type Graded = ReturnType<typeof gradeSkill>;
/** stage: fetch = 파일을 받지 못함(흐름의 "가져오기"), check = 받았지만 다 검사하지 못함·한도(흐름의 "등급 계산") */
export type SkillError = { kind: ErrorKind; message: string; stage: "fetch" | "check" };
/** path = 그 스킬 줄의 source_file(.claude/skills/<이름>) */
export type SkillScan = { key: string; path: string; result: Graded } | { key: string; path: string; error: SkillError };
/** 코드 읽기가 받은 파일 목록. complete = 트리를 잘리지 않고 끝까지 받았다, unseen = 내용을 볼 수 없는 항목(링크 · 서브모듈 · 너무 긴 경로) */
export type Tree = { paths: string[]; unseen: string[]; complete: boolean } | { error: { kind: ErrorKind; message: string } };
/** known = 이미 받은 파일(경로 → 글, 스킬 읽기의 SKILL.md) */
export type ScanInput = { repo: { owner: string; repo: string }; skills: FoundTech[]; tree: Tree; known: Map<string, string> };

type Task = SkillFiles & { skill: FoundTech; fetch: string[] };
type Repo = ScanInput["repo"];

const short = (text: string, max = 200) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const failOf = (s: FoundTech, error: SkillError): SkillScan => ({ key: s.tech!.key, path: s.sourceFile, error: { ...error, message: short(error.message) } });
const check = (message: string, kind: ErrorKind = "parse"): SkillError => ({ kind, message, stage: "check" });
const notOpened = (path: string) => new CollectError("http_status", `${short(path, 120)}: 목록에는 있는데 열 수 없음(404)`, 404);

/** 동시에 BATCH_FILES개까지만 열며 차례로 처리한다(한 스킬에 파일이 많아도 raw를 한꺼번에 열지 않게) */
async function inChunks<T, R>(items: T[], run: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += BATCH_FILES) out.push(...(await Promise.all(items.slice(i, i + BATCH_FILES).map(run))));
  return out;
}

/** 글 파일: 이미 받은 것은 그대로, 나머지는 raw로 끝까지. 못 받으면 던진다(가져오기 오류) */
async function readText(repo: Repo, t: Task, known: Map<string, string>): Promise<SourceFile[]> {
  return inChunks(t.paths, async (path) => {
    const text = known.get(path) ?? (await fetchText(rawFileUrl(repo, path), undefined, MAX_SKILL_CHARS));
    if (text === null) throw notOpened(path);
    return { path, text };
  });
}

/**
 * 그림 등: 앞 512바이트만 받아(Range) NUL 바이트가 있으면 진짜 바이너리라 건너뛴다. 글이면 확장자로 위장했을 수 있어 끝까지 받아 검사할 파일로 돌려준다.
 * 빈 파일(416)은 볼 것이 없어 건너뛴다. 서버가 Range를 무시하고 전부 주면 그 글을 그대로 쓴다
 */
async function readHeads(repo: Repo, t: Task): Promise<SourceFile[]> {
  const texts = await inChunks(t.inert, async (path) => {
    let head: string | null;
    try {
      head = await fetchText(rawFileUrl(repo, path), { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } }, MAX_SKILL_CHARS);
    } catch (e) {
      if (e instanceof CollectError && e.httpStatus === 416) return null;
      throw e;
    }
    if (head === null) throw notOpened(path);
    if (head.slice(0, HEAD_BYTES).includes("\u0000")) return null;
    const text = head.length > HEAD_BYTES ? head : await fetchText(rawFileUrl(repo, path), undefined, MAX_SKILL_CHARS);
    if (text === null) throw notOpened(path);
    return { path, text };
  });
  return texts.filter((f): f is SourceFile => f !== null);
}

/** 검사 결과 → 그 스킬의 결과. 위험은 찾은 그대로 두고, 그 밖에 다 보지 못한 것(볼 수 없는 항목·바이너리, 검사 못 한 긴 줄)은 수집 오류 */
function verdict(t: Task, files: SourceFile[]): SkillScan {
  const chars = files.reduce((n, f) => n + f.text.length, 0);
  if (chars > MAX_SKILL_CHARS) return failOf(t.skill, check(`파일 합이 ${chars}자라 한도 ${MAX_SKILL_CHARS}자를 넘음`));
  const g = gradeSkill(files);
  const unseen = [...t.opaque, ...g.binary];
  if (g.grade !== "danger" && unseen.length) return failOf(t.skill, check(`검사하지 못한 항목 ${unseen.length}개(예: ${short(unseen[0], 120)} — 실행·압축·바이너리 파일, 링크·서브모듈 등)`));
  if (g.grade !== "danger" && g.skippedLines > 0) return failOf(t.skill, check(`너무 긴 줄 ${g.skippedLines}개를 검사하지 못함(그 줄에 위험한 글이 있을 수 있음)`));
  if (g.grade === "unknown") return failOf(t.skill, check(g.reason));
  return { key: t.skill.tech!.key, path: t.skill.sourceFile, result: g };
}

/** 스킬마다 계획: 바로 오류인 것과 받을 일. 같은 키는 한 번만 내고, 대소문자만 다른 폴더가 있으면 그 줄은 수집 오류(한 폴더만 보고 통과로 두지 않게) */
function plan(input: ScanInput): (Task | SkillScan)[] {
  const { tree } = input;
  const seen = new Set<string>();
  const skills = input.skills.filter((s) => !seen.has(s.tech!.key) && seen.add(s.tech!.key));
  if ("error" in tree) return skills.map((s) => failOf(s, { ...tree.error, message: `파일 목록을 읽지 못해 스킬 파일을 검사하지 못함: ${tree.error.message}`, stage: "fetch" }));
  // shortcut: 아주 큰 저장소는 트리가 늘 잘려 스킬이 매번 수집 오류다. 스킬 폴더만 따로 목록을 받으면 풀리지만 API 호출이 는다
  if (!tree.complete) return skills.map((s) => failOf(s, check("GitHub가 파일 목록을 잘라 줘서 스킬 파일을 다 보지 못함")));
  const dirs = skillDirs(tree); // 파일 목록 전체(SKILL.md 없는 폴더, 스킬 30개 한도 밖 폴더 포함)를 한 번만 훑는다
  return skills.map((s) => {
    const dir = dirs.get(s.sourceFile.slice(`${SKILLS_DIR}/`.length).toLowerCase());
    // SKILL.md는 있었는데 목록에 이 폴더 파일이 없다 = 목록과 저장소가 어긋남. 읽은 것 없이 "확인함"으로 두지 않는다
    if (!dir) return failOf(s, check("파일 목록에 이 스킬 폴더의 파일이 없어 검사하지 못함"));
    if (dir.spellings.length > 1) return failOf(s, check(`이름이 대소문자만 다른 스킬 폴더가 ${dir.spellings.length}개(${dir.spellings.join(", ")})라 검사하지 못함`));
    const files = skillFilesOf(dir);
    if ("tooMany" in files) return failOf(s, check(`스킬의 ${files.tooMany}라 한도를 넘어 검사하지 못함`));
    if (files.paths.length === 0) return failOf(s, check("파일 목록에 이 스킬 폴더의 글 파일이 없어 검사하지 못함"));
    return { skill: s, ...files, fetch: files.paths.filter((p) => !input.known.has(p)) };
  });
}

type Left = { files: number; heads: number };

/** 받을 것이 있는 일만 몫을 쓴다: 시간 몫이 다했거나 수 합을 넘으면 그 스킬은 받지 않는다(이미 받은 글만 있는 스킬은 그대로 검사) */
function overBudget(t: Task, spentMs: number, left: Left): SkillError | null {
  if (t.fetch.length + t.inert.length === 0) return null;
  if (spentMs > SCAN_BUDGET_MS) return check("이번 읽기의 스킬 검사 시간 몫이 다해 검사하지 못함", "timeout");
  if (t.fetch.length > left.files) return check(`이번 읽기에서 받는 스킬 파일 수 한도(${MAX_SCAN_FILES}개)를 넘어 검사하지 못함`);
  return t.inert.length > left.heads ? check(`이번 읽기에서 확인하는 그림·글꼴 등의 수 한도(${MAX_SCAN_HEADS}개)를 넘어 검사하지 못함`) : null;
}

/** 한 스킬: 글 파일과 그림 등의 앞부분을 받아 판정. 못 받으면 가져오기 오류 */
async function scanOne(repo: Repo, t: Task, known: Map<string, string>): Promise<SkillScan> {
  try {
    const text = await readText(repo, t, known);
    return verdict(t, [...text, ...(await readHeads(repo, t))]);
  } catch (e) {
    return failOf(t.skill, { kind: errorKindOf(e), message: messageOf(e), stage: "fetch" });
  }
}

/**
 * 스킬마다 등급 또는 수집 오류(입력 순서, 같은 키는 한 번). 요청 수 합이 BATCH_FILES개가 되도록 여러 스킬을 묶어 한꺼번에 받는다
 * (한 스킬 안에서도 BATCH_FILES개씩). 같은 입력에는 같은 결과(불변 3).
 */
export async function scanSkills(input: ScanInput, now: () => number = Date.now): Promise<SkillScan[]> {
  const out = plan(input);
  const tasks = out.flatMap((x, i) => ("skill" in x ? [{ i, t: x }] : []));
  const started = now();
  const left: Left = { files: MAX_SCAN_FILES, heads: MAX_SCAN_HEADS };
  const cost = (t: Task) => t.fetch.length + t.inert.length;
  for (let k = 0; k < tasks.length;) {
    const group: typeof tasks = [];
    for (let n = 0; k < tasks.length && (group.length === 0 || n + cost(tasks[k].t) <= BATCH_FILES); k++) {
      const { i, t } = tasks[k];
      const over = overBudget(t, now() - started, left);
      if (over) { out[i] = failOf(t.skill, over); continue; }
      left.files -= t.fetch.length;
      left.heads -= t.inert.length;
      n += cost(t);
      group.push(tasks[k]);
    }
    await Promise.all(group.map(async ({ i, t }) => { out[i] = await scanOne(input.repo, t, input.known); }));
  }
  return out as SkillScan[];
}
