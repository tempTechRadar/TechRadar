// 첫 읽기의 스킬 위험 패턴 검사(SPEC-2, PRD-F6). 주인: 김영식 A.
// 파일 목록은 코드 읽기(read-models)가 이미 받은 트리를 쓰고, SKILL.md는 스킬 읽기가 받은 글을 쓴다: GitHub API 호출을 늘리지 않고, 나머지 파일만 raw로 받는다.
// 못 읽은 것·한도를 넘은 것·다 검사하지 못한 것은 그 스킬만 수집 오류다. 일부만 보고 "통과"·"확인함"이라 하지 않는다(불변 2).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { FoundTech } from "../domain/manifest.ts";
import type { SourceFile } from "../domain/risk-patterns.ts";
import { MAX_SKILL_CHARS, gradeSkill, skillFilesOf } from "../domain/skill-scan.ts";
import { SKILLS_DIR } from "../domain/skills.ts";
import { CollectError, errorKindOf, fetchText, messageOf, rawFileUrl, type ErrorKind } from "./collect-fetch.ts";

export const SCAN_BUDGET_MS = 20_000; // 스킬 검사 시간 몫: 마지막 묶음이 시간 제한(10초)까지 걸려도 30초 안
export const MAX_SCAN_FILES = 200; // 한 번 읽기에서 raw로 받는 스킬 파일 수 합
const BATCH_FILES = 20; // 한꺼번에 받는 파일 수(여러 스킬을 묶어서): 100개를 동시에 열면 GitHub raw가 끊는다

type Graded = ReturnType<typeof gradeSkill>;
/** stage: fetch = 파일을 받지 못함(흐름의 "가져오기"), check = 받았지만 다 검사하지 못함·한도(흐름의 "등급 계산") */
export type SkillError = { kind: ErrorKind; message: string; stage: "fetch" | "check" };
/** path = 그 스킬 줄의 source_file(.claude/skills/<이름>) */
export type SkillScan = { key: string; path: string; result: Graded } | { key: string; path: string; error: SkillError };
/** 코드 읽기가 받은 파일 목록. complete = 트리를 잘리지 않고 끝까지 받았다, links = 심볼릭 링크 */
export type Tree = { paths: string[]; links: string[]; complete: boolean } | { error: { kind: ErrorKind; message: string } };
/** known = 이미 받은 파일(경로 → 글, 스킬 읽기의 SKILL.md) */
export type ScanInput = { repo: { owner: string; repo: string }; skills: FoundTech[]; tree: Tree; known: Map<string, string> };

type Task = { skill: FoundTech; paths: string[]; opaque: string[]; fetch: string[] };

const failOf = (s: FoundTech, error: SkillError): SkillScan => ({ key: s.tech!.key, path: s.sourceFile, error });
const check = (message: string, kind: ErrorKind = "parse"): SkillError => ({ kind, message, stage: "check" });

/** 한 스킬의 파일: 이미 받은 것은 그대로, 나머지는 raw로. 못 받으면 fetch 오류, 합이 한도를 넘으면 check 오류로 던진다 */
async function readFiles(repo: ScanInput["repo"], t: Task, known: Map<string, string>): Promise<SourceFile[]> {
  const files = await Promise.all(t.paths.map(async (path) => {
    const text = known.get(path) ?? (await fetchText(rawFileUrl(repo, path), undefined, MAX_SKILL_CHARS));
    if (text === null) throw new CollectError("http_status", `${path}: 목록에는 있는데 열 수 없음(404)`, 404);
    return { path, text };
  }));
  const chars = files.reduce((n, f) => n + f.text.length, 0);
  if (chars > MAX_SKILL_CHARS) throw Object.assign(new CollectError("parse", `파일 합이 ${chars}자라 한도 ${MAX_SKILL_CHARS}자를 넘음`), { stage: "check" });
  return files;
}

/** 검사 결과 → 그 스킬의 결과. 위험은 찾은 그대로 두고, 그 밖에 다 보지 못한 것(실행·압축·링크·바이너리 파일, 검사 못 한 긴 줄)은 수집 오류 */
function verdict(t: Task, g: Graded): SkillScan {
  const unseen = [...t.opaque, ...g.binary];
  if (g.grade !== "danger" && unseen.length) return failOf(t.skill, check(`글로 검사할 수 없는 파일 ${unseen.length}개(${unseen[0]} 등: 실행·압축·링크·바이너리)`));
  if (g.grade !== "danger" && g.skippedLines > 0) return failOf(t.skill, check(`너무 긴 줄 ${g.skippedLines}개를 검사하지 못함(그 줄에 위험한 글이 있을 수 있음)`));
  if (g.grade === "unknown") return failOf(t.skill, check(g.reason));
  return { key: t.skill.tech!.key, path: t.skill.sourceFile, result: g };
}

/** 스킬마다 계획: 바로 오류인 것과 받을 일. 같은 키(대소문자만 다른 폴더)는 첫 것만: 같은 줄에 등급을 두 번 쓰지 않게 */
function plan(input: ScanInput): (Task | SkillScan)[] {
  const { tree } = input;
  const seen = new Set<string>();
  const skills = input.skills.filter((s) => !seen.has(s.tech!.key) && seen.add(s.tech!.key));
  if ("error" in tree) return skills.map((s) => failOf(s, { ...tree.error, message: `파일 목록을 읽지 못해 스킬 파일을 검사하지 못함: ${tree.error.message}`, stage: "fetch" }));
  // shortcut: 아주 큰 저장소는 트리가 늘 잘려 스킬이 매번 수집 오류다. 스킬 폴더만 따로 목록을 받으면 풀리지만 API 호출이 는다
  if (!tree.complete) return skills.map((s) => failOf(s, check("GitHub가 파일 목록을 잘라 줘서 스킬 파일을 다 보지 못함")));
  return skills.map((s) => {
    const files = skillFilesOf(tree, s.sourceFile.slice(`${SKILLS_DIR}/`.length));
    if ("tooMany" in files) return failOf(s, check(`스킬 파일이 ${files.tooMany}개라 한도를 넘어 검사하지 못함`));
    // SKILL.md는 있었는데 목록에 이 폴더 파일이 없다 = 목록과 저장소가 어긋남. 읽은 것 없이 "확인함"으로 두지 않는다
    if (files.paths.length === 0) return failOf(s, check("파일 목록에 이 스킬 폴더의 파일이 없어 검사하지 못함"));
    return { skill: s, ...files, fetch: files.paths.filter((p) => !input.known.has(p)) };
  });
}

/** 받을 파일이 있는 일만 몫을 쓴다: 시간 몫이 다했거나 파일 수 합을 넘으면 그 스킬은 받지 않는다(이미 받은 글만 있는 스킬은 그대로 검사) */
function overBudget(t: Task, spentMs: number, left: number): SkillError | null {
  if (t.fetch.length === 0) return null;
  if (spentMs > SCAN_BUDGET_MS) return check("이번 읽기의 스킬 검사 시간 몫이 다해 검사하지 못함", "timeout");
  return t.fetch.length > left ? check(`이번 읽기에서 받는 스킬 파일 수 한도(${MAX_SCAN_FILES}개)를 넘어 검사하지 못함`) : null;
}

/**
 * 스킬마다 등급 또는 수집 오류(입력 순서, 같은 키는 한 번). 받을 파일을 BATCH_FILES개씩 여러 스킬을 묶어 한꺼번에 받는다.
 * 같은 입력에는 같은 결과(불변 3).
 */
export async function scanSkills(input: ScanInput, now: () => number = Date.now): Promise<SkillScan[]> {
  const out = plan(input);
  const tasks = out.flatMap((x, i) => ("skill" in x ? [{ i, t: x }] : []));
  const started = now();
  let left = MAX_SCAN_FILES;
  for (let k = 0; k < tasks.length;) {
    const group: typeof tasks = [];
    for (let n = 0; k < tasks.length && (group.length === 0 || n + tasks[k].t.fetch.length <= BATCH_FILES); k++) {
      const { i, t } = tasks[k];
      const over = overBudget(t, now() - started, left);
      if (over) { out[i] = failOf(t.skill, over); continue; }
      left -= t.fetch.length;
      n += t.fetch.length;
      group.push(tasks[k]);
    }
    await Promise.all(group.map(async ({ i, t }) => {
      try {
        out[i] = verdict(t, gradeSkill(await readFiles(input.repo, t, input.known)));
      } catch (e) {
        const stage = (e as { stage?: "check" }).stage ?? "fetch";
        out[i] = failOf(t.skill, { kind: errorKindOf(e), message: messageOf(e), stage });
      }
    }));
  }
  return out as SkillScan[];
}
