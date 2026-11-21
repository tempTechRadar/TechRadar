// 등록 → 저장소 읽기 → OSV → 등급 → 변경 (P-3, 주인: 김영식 A). flow 상자: fetch_repo → extract_my_tech → fetch_osv → grade → is_event → save_change → notify
// 쓰기는 서비스 키(erd "쓰기는 서버"). 누구의 것인지는 화면이 아니라 여기서 getCurrentUser로 받은 사람으로 정한다(불변 5).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "./current-user.ts";
import { getServiceSupabase } from "./service-supabase.ts";
import { startRun, recordStep, finishRun, type RunResult, type RunTrigger } from "./run-log.ts";
import { readLatestChange, saveChange } from "./changes.ts";
import { notifyOwner } from "./notify-owner.ts";
import { assertRepoPublic, CollectError, OSV_QUERY_URL, RepoNotPublicError, errorKindOf, fetchText, messageOf, queryOsv, rawFileUrl, type ErrorKind } from "./collect-fetch.ts";
import { REPO_FILES, readRepoFile, requirementIncludes, type FoundTech } from "../domain/manifest.ts";
import { SKILLS_DIR } from "../domain/skills.ts";
import { readSkills } from "./read-skills.ts";
import { CODE_FILES, readModels } from "./read-models.ts";
import { eolOfKey } from "../domain/model-eol.ts";
import { detectConcepts, detectServices } from "../domain/services.ts";
import { GRADE_RULE_VERSION, gradeFromOsv, type GradeResult, type RepoFacts } from "../domain/grade.ts";
import { causeIdsOf } from "../domain/osv-daily.ts";
import { readRepoFacts } from "./osv-store.ts";

// shortcut: 사용자당 등록 횟수 제한·백그라운드 실행은 없음. 정기 실행(P-17)에서 OSV 반복을 옮길 때 함께
const MAX_TECHS = 50; // 저장소 하나에서 읽는 기술 수 한도
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RepoRef = { owner: string; repo: string; url: string };
// 서버 안에서만 쓴다. changesCreated를 화면·응답으로 내보내면 "다른 사람이 먼저 읽었다"는 사실이 드러난다(불변 5).
export type ReadResult = { projectId: string; runId: string; found: number; danger: number; changesCreated: number; errors: number; status: RunResult };

/** 공개 GitHub 저장소를 등록(이미 있으면 다시 읽기)하고 끝까지 읽는다. 새 등록은 저장소가 안 열리면 막는다(RepoNotPublicError). */
export async function registerAndRead(user: CurrentUser, repo: RepoRef, deps: { db?: SupabaseClient } = {}): Promise<ReadResult> {
  const db = deps.db ?? getServiceSupabase();
  if (!db) throw new Error("서버에 Supabase 서비스 키가 없다(.env.local)");

  const existingId = await findProject(db, user.id, repo.url);
  // 새 등록만 막는다(PRD-F4): GitHub가 "열 수 없다"고 답한 저장소는 프로젝트·실행을 만들지 않는다. 다시 읽기는 readRepo가 확인한다.
  // shortcut: 확인 자체가 안 되면(한도·연결) 막지 않는다 — 파일도 못 열면 readRepo가 수집 오류로 남긴다. 서버 토큰(P-9)이 붙으면 막는 쪽으로
  if (!existingId) await assertRepoPublic(repo).catch((e) => { if (e instanceof RepoNotPublicError) throw e; });
  const projectId = existingId ?? (await insertProject(db, user.id, repo));
  const trigger: RunTrigger = existingId ? "user_reread" : "first_read";
  const runId = await startRun(db, { trigger, startedBy: user.id, projectId });
  try {
    const result = await readAndGrade(db, { runId, projectId, ownerId: user.id }, repo);
    await finishRun(db, runId, { status: result.status, itemCount: result.found });
    return result;
  } catch (e) {
    // 원래 오류를 던지는 게 우선이라, 실행 닫기 실패는 원래 오류를 가리지 않게 덧붙이기만 한다
    await finishRun(db, runId, { status: "failed" }).catch((closeErr) => console.error("실행을 닫지 못함", closeErr));
    throw e;
  }
}

async function readAndGrade(db: SupabaseClient, ctx: { runId: string; projectId: string; ownerId: string }, repo: RepoRef): Promise<ReadResult> {
  const { runId, projectId } = ctx;
  const { found, dropped, fileErrors, filesParsed } = await readRepo(db, runId, repo);
  const readAt = new Date().toISOString();
  const techIds = await saveMyTechnologies(db, { ownerId: ctx.ownerId, projectId, readAt }, found);
  // 못 읽은 파일에서 전에 읽은 기술은 지우지 않고 수집 오류로(불변 2: "사라짐"으로 단정하지 않음).
  // 목록이 전부가 아닐 수 있다는 안내(soft, requirements.txt의 -r)는 읽은 기술 줄의 잘못이 아니라서 줄에 딱지를 붙이지 않는다.
  for (const f of fileErrors.filter((e) => !e.soft)) {
    // 스킬 폴더 오류는 그 아래 스킬 줄(".claude/skills/<이름>") 모두, 한도로 일부만 읽었으면 그중 이번에 못 읽은 줄만 대상이다
    // 코드 파일 쪽 오류: 이 프로젝트에서 이번에 다시 보지 못한 줄만(읽은 줄은 덮지 않음). 파일 목록 자체를 못 읽었으면 목록으로 찾는 연동 서비스 · 개념까지,
    // 목록은 읽었고 코드 파일 일부만 못 봤으면(onlyUnread) 모델 줄만: 서비스 · 개념은 목록과 package.json으로 이미 다시 확인했다
    const modelIds = f.path === CODE_FILES ? await modelRowIds(db, projectId, f.onlyUnread ? ["model"] : ["model", "service", "concept"]) : null;
    if (modelIds?.length === 0) continue;
    const q = db.from("my_technologies").update({ collect_error_kind: f.kind }).eq("project_id", projectId);
    const unread = `read_at.is.null,read_at.lt."${readAt}"`;
    const skillRows = () => q.like("source_file", `${SKILLS_DIR}/%`);
    let r;
    if (modelIds) r = await q.in("id", modelIds).or(unread);
    else r = await (f.path !== SKILLS_DIR ? q.eq("source_file", f.path) : f.onlyUnread ? skillRows().or(unread) : skillRows());
    if (r.error) throw new Error(`수집 오류를 저장하지 못함: ${r.error.message}`);
  }
  if (dropped.length) {
    // 한도로 못 읽은 기술: 이번 읽기에서 갱신되지 않은 이 프로젝트의 저장소 줄을 수집 오류로(목록 없이 한 번, 불변 2)
    const r = await db.from("my_technologies").update({ collect_error_kind: "parse" })
      .eq("project_id", projectId).eq("origin", "repo").or(`read_at.is.null,read_at.lt."${readAt}"`);
    if (r.error) throw new Error(`수집 오류를 저장하지 못함: ${r.error.message}`);
  }

  const { graded, osvErrors, osvTargets } = await gradeAll(db, runId, projectId, found, techIds);
  const events = graded.filter((g) => g.result.grade === "danger");
  await recordStep(db, runId, {
    stepName: "is_event",
    status: "succeeded",
    countIn: osvTargets,
    branchCounts: { event: events.length, no_change: graded.length - events.length, collect_error: osvErrors },
  });

  // 위험이면 변경 저장은 늘 부른다: 같은 키면 이미 있는 변경이 돌아온다(불변 3). 두 번째 사용자는 그 변경에 알림만 새로 생긴다(SPEC-3.1).
  let changesCreated = 0;
  const saved: { id: string; techId: string; kind?: "model_eol" }[] = [];
  for (const g of events) {
    // 위험이 이미 이어지는 중이면(정기 OSV 확인이 회차를 올렸을 수 있다) 가장 최근 변경에 알림을 잇는다. 회차를 늘 1로 두면 오래된 변경에 붙고,
    // 다음 정기 확인이 최근 변경에 같은 사람의 알림을 하나 더 만든다.
    // shortcut: 고쳐졌다 다시 위험해진 것을 첫 읽기가 먼저 만나면 새 회차를 못 만든다(위 등급 저장이 먼저 위험으로 바꿔 정기 확인이 "다시 위험"을 못 알아봄). 드문 경우
    const latest = await readLatestChange(db, { techId: g.techId, version: g.f.tech!.version }, causeIdsOf(g.result));
    const change = latest
      ? { id: latest.id, created: false }
      : await saveChange(db, {
          kind: "first_seen_danger", // 사용자가 읽을 때 이미 위험 = 처음 확인한 위험. 정기 확인(P-9d)은 grade_to_danger
          techId: g.techId,
          tech: g.f.tech!,
          causeId: g.result.causeId!,
          currValue: { grade: "danger", reason: g.result.reason, fixed_version: g.result.fixedVersion, evidence: g.result.evidence },
        });
    if (change.created) changesCreated++;
    saved.push({ id: change.id, techId: g.techId });
  }
  // 나간 건수 = 들어온 건수: 위험 변경마다 새로 만들었든 이미 있든 이 읽기에서 내가 만난 것으로 센다. 새로 만든 수(changesCreated)를 적으면
  // 다른 사람이 먼저 읽었다는 사실이 내 실행 기록(RLS로 내가 읽음)에 드러난다(불변 5). 새로 만든 수는 돌려주는 값에만 둔다.
  // 모델 지원 종료(SPEC-3.3): 코드에 쓴 모델이 공식 종료 표에 있으면 변경 하나. 같은 모델 · 같은 종료일은 다시 읽어도 한 번(불변 3)
  const eol = found.flatMap((f) => { const n = f.tech ? eolOfKey(f.tech.key) : undefined; return n ? [{ f, n }] : []; });
  for (const { f, n } of eol) {
    const techId = techIds.get(f.tech!.key)!;
    const change = await saveChange(db, {
      kind: "model_eol", techId, tech: f.tech!, causeId: `eol:${n.retireOn}`,
      currValue: { model: n.model, provider: n.provider, retire_on: n.retireOn, replacement: n.replacement, source: n.source },
    });
    if (change.created) changesCreated++;
    saved.push({ id: change.id, techId, kind: "model_eol" });
  }
  const changeCount = events.length + eol.length;
  await recordStep(db, runId, { stepName: "save_change", status: "succeeded", countIn: changeCount, countOut: changeCount });
  await notifyOwner(db, ctx, saved);

  const errors = fileErrors.length + osvErrors;
  return { projectId, runId, found: found.length, danger: events.length, changesCreated, errors, status: runStatus(fileErrors, osvErrors, filesParsed) };
}

/**
 * 가져와 해석까지 끝낸 파일이 하나도 없는데 오류가 있으면 실패(저장소가 안 열린 것·모든 파일이 깨진 것을 일부 성공처럼 보이지 않게, 불변 2).
 * 해석한 파일이 있으면 일부 오류는 일부 성공. 읽는 파일이 늘어도 기준이 바뀌지 않는다: 원래 없는 파일(404)은 오류가 아니라서 "모든 파일이 오류"로는 판단할 수 없다.
 */
function runStatus(fileErrors: FileError[], osvErrors: number, filesParsed: number): RunResult {
  if (fileErrors.length + osvErrors === 0) return "succeeded";
  return filesParsed === 0 && fileErrors.length > 0 ? "failed" : "partial";
}

/** soft = 파일은 읽었지만 일부를 못 읽었다는 안내(그 파일에서 읽은 기술 줄에는 오류 딱지를 붙이지 않는다) */
type FileError = { path: string; kind: ErrorKind; message: string; soft?: boolean; onlyUnread?: boolean };

/** 연 파일이 하나도 없는데 일부는 404일 때: "파일 없음"인지 저장소가 안 열린 것인지 저장소부터 확인한다(404는 비공개·없는 저장소도 같다, 불변 2). */
async function closedRepoErrors(repo: RepoRef, already: FileError[]): Promise<FileError[]> {
  try {
    await assertRepoPublic(repo);
    return [];
  } catch (e) {
    const message = messageOf(e);
    // 스킬 폴더도 같은 저장소 안이라 함께 못 읽은 것: 전에 읽은 스킬 줄도 수집 오류로(목록 404를 "스킬 없음"으로 읽지 않게, 불변 2)
    return [...REPO_FILES, SKILLS_DIR, CODE_FILES].filter((path) => !already.some((f) => f.path === path)).map((path) => ({ path, kind: errorKindOf(e), message }));
  }
}

/** 읽는 파일을 한꺼번에 가져온다(서로 모르는 사이라, 차례로 하면 느린 응답의 시간 제한이 겹쳐 쌓인다). 결과는 REPO_FILES 순서. 없는 파일(404)은 건너뛴다. */
async function fetchRepoFiles(repo: RepoRef) {
  const files: { path: string; text: string }[] = [];
  const fileErrors: FileError[] = [];
  const fetched = await Promise.all(REPO_FILES.map(async (path) => {
    try {
      return { path, text: await fetchText(rawFileUrl(repo, path)) } as const;
    } catch (e) {
      return { path, failure: e } as const;
    }
  }));
  for (const f of fetched) {
    if ("failure" in f) fileErrors.push({ path: f.path, kind: errorKindOf(f.failure), message: messageOf(f.failure) });
    else if (f.text !== null) files.push({ path: f.path, text: f.text });
  }
  if (files.length === 0 && fileErrors.length < REPO_FILES.length) fileErrors.push(...(await closedRepoErrors(repo, fileErrors)));
  return { files, fileErrors };
}

/** fetch_repo → extract_my_tech. 파일마다 따로: 없는 파일은 건너뛰고, 못 읽거나 깨진 파일은 그 파일만 오류. */
async function readRepo(db: SupabaseClient, runId: string, repo: RepoRef) {
  const { files, fileErrors } = await fetchRepoFiles(repo);
  // 스킬 폴더(PRD-F6): 폴더 목록 1번 + 폴더마다 SKILL.md. 폴더가 없으면 읽은 스킬이 없을 뿐이고, 못 읽었으면 수집 오류다.
  const closed = fileErrors.some((f) => f.path === SKILLS_DIR);
  // 코드 속 지원 종료 모델(PRD-F38)도 같은 저장소의 서로 모르는 읽기라 함께 돈다
  const [skills, models] = closed
    ? [{ found: [], errors: [], folders: 0 }, { found: [], errors: [], scanned: 0, treePaths: [] }]
    : await Promise.all([readSkills(repo), readModels(repo)]);
  fileErrors.push(...skills.errors, ...models.errors);
  await recordStep(db, runId, {
    stepName: "fetch_repo",
    status: fileErrors.length ? "failed" : "succeeded",
    inputSummary: repo.url,
    outputSummary: `읽음 ${files.map((f) => f.path).join(", ") || "없음"}${skills.folders ? ` · 스킬 폴더 ${skills.folders}개` : ""}${models.scanned ? ` · 코드 파일 ${models.scanned}개` : ""}`,
    countIn: REPO_FILES.length + skills.folders + models.scanned,
    countOut: files.length + skills.found.length + models.scanned,
    errorKind: fileErrors[0]?.kind,
    errorMessage: [...new Set(fileErrors.map((f) => f.message))].join("; ") || undefined,
  });

  // extract_my_tech: 깨진 파일은 해석 실패로 남기고 나머지는 계속.
  const found: FoundTech[] = [];
  let filesParsed = 0;
  for (const f of files) {
    try {
      found.push(...readRepoFile(f.path, f.text));
      filesParsed++;
      // requirements.txt가 다른 파일(-r)을 포함하면 그 파일은 읽지 않으니 전부 읽은 것처럼 보이지 않게 부분 오류로 남긴다(불변 2)
      const included = f.path === "requirements.txt" ? requirementIncludes(f.text) : [];
      if (included.length) fileErrors.push({ path: f.path, kind: "parse", soft: true, message: `${f.path}: 다른 파일(${includedPaths(included)})을 포함해요. 그 파일은 읽지 않아 목록이 전부가 아닐 수 있어요` });
    } catch (e) {
      fileErrors.push({ path: f.path, kind: "parse", message: `${f.path}: ${e instanceof Error ? e.message : e}` });
    }
  }
  found.push(...skills.found);
  // 같은 기술이 두 파일에 있으면 한 줄만: 버전을 아는 쪽을 남기고, 같으면 앞 파일(REPO_FILES 순서)을 남긴다. my_technologies (project_id, tech_id) UK와 맞춘다.
  const best = new Map<string, FoundTech>();
  for (const f of found) {
    const prev = f.tech && best.get(f.tech.key);
    if (f.tech && (!prev || (prev.tech?.version == null && f.tech.version !== null))) best.set(f.tech.key, f);
  }
  // 키 없는 줄(별명만)은 (project_id, manual_name) UK라 같은 별명은 앞 파일 하나만: 두 도구 설정에 같은 별명이 있어도 저장이 깨지지 않게
  const firstByName = new Map<string, FoundTech>();
  for (const f of found) if (!f.tech && !firstByName.has(f.name)) firstByName.set(f.name, f);
  const unique = found.filter((f) => (f.tech ? best.get(f.tech.key) === f : firstByName.get(f.name) === f));
  // 연동 서비스 · 개념(PRD-F40): SDK(package.json · requirements.txt)와 파일 목록으로. 정해 둔 목록에서만 나온다
  const modelList = [...firstPerKey(models.found), ...detectServices(files, models.treePaths), ...detectConcepts(models.treePaths)];
  await recordStep(db, runId, {
    stepName: "extract_my_tech",
    status: fileErrors.some((f) => f.kind === "parse") ? "failed" : "succeeded",
    countIn: files.length + skills.found.length + models.scanned,
    countOut: unique.length + modelList.length,
    outputSummary: [...unique, ...modelList].map((f) => f.tech?.key ?? `찾지 못함:${f.name}`).join(", "),
    errorKind: fileErrors.find((f) => f.kind === "parse") && "parse",
    errorMessage: fileErrors.filter((f) => f.kind === "parse").map((f) => f.message).join("; ") || undefined,
  });
  // 아무 저장소나 등록할 수 있으니 공용 카탈로그·OSV 호출이 한 번에 커지지 않게 자른다. 잘린 것은 남겨서 보이게
  // 스킬을 하나라도 읽었으면 해석한 것이 있다(저장소 파일이 없고 스킬만 있는 저장소도 실패가 아니다)
  // 모델 · 연동 서비스 · 개념은 OSV를 부르지 않고 정해 둔 목록에서만 나와(수가 정해져 있다) 기술 수 한도 밖에 둔다: 의존성이 많은 저장소에서 먼저 잘리지 않게.
  // 코드 파일을 하나라도 열었으면 해석한 것이 있다(모델이 없어도)
  return { found: [...unique.slice(0, MAX_TECHS), ...modelList], dropped: unique.slice(MAX_TECHS), fileErrors, filesParsed: filesParsed + skills.found.length + models.scanned };
}

/** 같은 모델이 여러 파일에 있으면 앞 파일 하나(my_technologies (project_id, tech_id) UK) */
function firstPerKey(found: FoundTech[]): FoundTech[] {
  const first = new Map<string, FoundTech>();
  for (const f of found) if (!first.has(f.tech!.key)) first.set(f.tech!.key, f);
  return [...first.values()];
}

/** 포함 경로는 믿을 수 없는 글이라 오류 메시지에 길게 싣지 않는다: 앞 3개, 하나당 80자까지 */
function includedPaths(paths: string[]): string {
  const shown = paths.slice(0, 3).map((p) => (p.length > 80 ? `${p.slice(0, 80)}…` : p)).join(", ");
  return paths.length > 3 ? `${shown} 외 ${paths.length - 3}개` : shown;
}

/** 통과 판단에 쓰는 저장소 확인 값. 못 읽어도 처음 읽기는 멈추지 않는다(OSV 위험 결과를 저장해야 함): 이유만 돌려주고 단계 기록에 남긴다. */
async function readFactsSafely(db: SupabaseClient, techIds: string[]): Promise<{ facts: Map<string, RepoFacts>; error?: string }> {
  try {
    return { facts: await readRepoFacts(db, techIds) };
  } catch (e) {
    return { facts: new Map(), error: `저장소 확인 값을 읽지 못해 통과 여부를 정하지 못했어요(찾지 못함이면 있던 등급을 그대로 둠): ${messageOf(e)}` };
  }
}

/** fetch_osv → grade. 한 기술의 실패는 그 기술만 수집 오류, 다른 기술은 계속. */
async function gradeAll(db: SupabaseClient, runId: string, projectId: string, found: FoundTech[], techIds: Map<string, string>) {
  const graded: { f: FoundTech; techId: string; result: GradeResult }[] = [];
  const osvFailures: { kind: ErrorKind; message: string; httpStatus?: number }[] = [];
  const osvTargets = found.filter((f) => f.tech?.key.startsWith("npm:") || f.tech?.key.startsWith("pypi:"));
  // 다시 읽을 때 정기 확인이 매긴 "통과"가 "찾지 못함"으로 되돌아가지 않게 같은 저장소 확인 값을 쓴다
  const { facts: repoFacts, error: repoFactsError } = await readFactsSafely(db, osvTargets.map((f) => techIds.get(f.tech!.key)!));
  for (const [i, f] of osvTargets.entries()) {
    if (i > 0) await sleep(1000); // SPEC-8 요청 사이 1초
    const techId = techIds.get(f.tech!.key)!;
    const target = { projectId, techId, version: f.tech!.version };
    const [eco, name] = f.tech!.key.startsWith("npm:") ? (["npm", f.tech!.key.slice(4)] as const) : (["PyPI", f.tech!.key.slice(5)] as const);
    try {
      const facts = repoFacts.get(techId);
      const result = gradeFromOsv(f.tech!.version, await queryOsv(name, eco, f.tech!.version), facts && { ...facts, nowMs: Date.now() });
      // 확인 값을 못 읽었는데 "찾지 못함"이면 통과였을 수도 있다: 있던 등급을 덮지 않는다(불변 4). 위험·주의는 확인 값과 무관해 그대로 저장한다
      if (repoFactsError && result.grade === "unknown") continue;
      await applyGrade(db, runId, target, result);
      graded.push({ f, techId, result });
    } catch (e) {
      if (!(e instanceof CollectError)) throw e; // DB 오류 등은 삼키지 않는다
      osvFailures.push({ kind: e.kind, message: `${f.tech!.key}: ${e.message}`, httpStatus: e.httpStatus });
      await markCollectError(db, target, e.kind);
    }
  }
  await recordStep(db, runId, {
    stepName: "fetch_osv",
    status: osvFailures.length ? "failed" : "succeeded",
    countIn: osvTargets.length,
    countOut: graded.length,
    branchCounts: { ok: graded.length, collect_error: osvFailures.length },
    apiUrl: OSV_QUERY_URL,
    httpStatus: osvFailures[0]?.httpStatus,
    errorKind: osvFailures[0]?.kind,
    errorMessage: osvFailures.map((f) => f.message).join("; ") || undefined,
  });
  const byGrade = graded.reduce<Record<string, number>>((m, g) => ({ ...m, [g.result.grade]: (m[g.result.grade] ?? 0) + 1 }), {});
  await recordStep(db, runId, { stepName: "grade", status: "succeeded", countIn: graded.length, countOut: graded.length, branchCounts: byGrade, errorMessage: repoFactsError });
  return { graded, osvErrors: osvFailures.length, osvTargets: osvTargets.length };
}

/** 이 프로젝트에서 파일 목록 · 코드 파일로 찾는 줄(종류 model · service · concept 중 고른 것) id */
async function modelRowIds(db: SupabaseClient, projectId: string, types: string[]): Promise<string[]> {
  const r = await db.from("my_technologies").select("id, technologies!inner(type)").eq("project_id", projectId).in("technologies.type", types);
  if (r.error) throw new Error(`모델 줄을 읽지 못함: ${r.error.message}`);
  return (r.data as { id: string }[]).map((row) => row.id);
}

async function findProject(db: SupabaseClient, ownerId: string, repoUrl: string): Promise<string | null> {
  const existing = await db.from("projects").select("id").eq("owner_id", ownerId).eq("repo_url", repoUrl).maybeSingle();
  if (existing.error) throw new Error(`프로젝트를 찾지 못함: ${existing.error.message}`);
  return (existing.data?.id as string | undefined) ?? null;
}

async function insertProject(db: SupabaseClient, ownerId: string, repo: { repo: string; url: string }): Promise<string> {
  const inserted = await db.from("projects").insert({ owner_id: ownerId, kind: "repo", name: repo.repo, repo_url: repo.url }).select("id").single();
  if (inserted.error) throw new Error(`프로젝트를 저장하지 못함: ${inserted.error.message}`);
  return inserted.data.id as string;
}

/** 카탈로그에 기술을 잇고(없으면 만들고) 내 기술 줄을 남긴다. 기술 키 → technologies.id */
async function saveMyTechnologies(db: SupabaseClient, at: { ownerId: string; projectId: string; readAt: string }, found: FoundTech[]) {
  const { ownerId, projectId, readAt } = at;
  const keyed = found.filter((f) => f.tech);
  const ids = new Map<string, string>();
  if (keyed.length) {
    const rows = keyed.map((f) => ({ tech_key: f.tech!.key, display_name: f.name, type: f.type, depth: "thick", thick_reasons: ["used"] }));
    const up = await db.from("technologies").upsert(rows, { onConflict: "tech_key", ignoreDuplicates: true });
    if (up.error) throw new Error(`기술 카탈로그에 저장하지 못함: ${up.error.message}`);
    const sel = await db.from("technologies").select("id, tech_key").in("tech_key", keyed.map((f) => f.tech!.key));
    if (sel.error) throw new Error(`기술 카탈로그를 읽지 못함: ${sel.error.message}`);
    sel.data.forEach((t) => ids.set(t.tech_key, t.id));
  }
  const mine = found.map((f) => ({
    owner_id: ownerId,
    added_by: ownerId,
    project_id: projectId,
    origin: "repo",
    source_file: f.sourceFile,
    read_at: readAt,
    collect_error_kind: null,
    unknown_origin: f.unknownOrigin === true,
    ...(f.tech ? { tech_id: ids.get(f.tech.key), version: f.tech.version } : { manual_name: f.name }),
  }));
  for (const [conflict, rows] of [["project_id,tech_id", mine.filter((m) => "tech_id" in m)], ["project_id,manual_name", mine.filter((m) => !("tech_id" in m))]] as const) {
    if (!rows.length) continue;
    const r = await db.from("my_technologies").upsert(rows, { onConflict: conflict });
    if (r.error) throw new Error(`내 기술을 저장하지 못함: ${r.error.message}`);
  }
  return ids;
}

type Target = { projectId: string; techId: string; version: string | null };

/** 같은 기술·같은 버전의 내 기술 줄(사람 상관없이). 등급은 버전마다라서 여기에 쓴다(erd 2.2 "왜 등급이 두 곳에"). */
const sameVersion = (db: SupabaseClient, t: Target, patch: Record<string, unknown>) => {
  const q = db.from("my_technologies").update(patch).eq("tech_id", t.techId);
  return t.version === null ? q.is("version", null) : q.eq("version", t.version);
};

/** 등급 저장. 근거가 바뀌었을 때만 수집 자료(observations, "바뀐 값만")를 남긴다. */
async function applyGrade(db: SupabaseClient, runId: string, t: Target, r: GradeResult) {
  const prev = await db.from("my_technologies").select("grade, grade_evidence").eq("project_id", t.projectId).eq("tech_id", t.techId).single();
  if (prev.error) throw new Error(`내 기술을 읽지 못함: ${prev.error.message}`);
  const curr = r.evidence.map((e) => ({ id: e.id, severity: e.severity, fixed: e.fixed }));
  const prevIds = ((prev.data.grade_evidence as { id: string }[] | null) ?? []).map((e) => e.id).join(",");
  if (prevIds !== curr.map((e) => e.id).join(",") || prev.data.grade !== r.grade) {
    const src = await db.from("sources").select("id").eq("name", "osv").single();
    if (src.error) throw new Error(`출처 osv를 찾지 못함: ${src.error.message}`);
    const obs = await db.from("observations").insert({
      source_id: src.data.id, tech_id: t.techId, metric: "osv_vulns", run_id: runId, observed_at: new Date().toISOString(),
      prev_value: { version: t.version, grade: prev.data.grade, vulns: prev.data.grade_evidence },
      curr_value: { version: t.version, grade: r.grade, vulns: curr },
      change_size: prev.data.grade === r.grade ? "small" : "large",
    });
    if (obs.error) throw new Error(`수집 자료를 저장하지 못함: ${obs.error.message}`);
  }
  const now = new Date().toISOString();
  // 같은 버전의 남의 줄에는 등급만 나눈다. 수집 오류·확인 시각은 그 줄을 읽은 실행이 정한다(불변 2: 남의 오류를 지우지 않음)
  const up = await sameVersion(db, t, {
    grade: r.grade, grade_reason: r.reason, grade_evidence: r.evidence, grade_rule_version: GRADE_RULE_VERSION, graded_at: now,
  });
  if (up.error) throw new Error(`등급을 저장하지 못함: ${up.error.message}`);
  const mine = await db.from("my_technologies").update({ last_checked_ok_at: now, collect_error_kind: null })
    .eq("project_id", t.projectId).eq("tech_id", t.techId);
  if (mine.error) throw new Error(`확인 시각을 저장하지 못함: ${mine.error.message}`);
}

/** 수집 오류: 등급은 그대로 두고 오류 종류만(불변 2, SPEC-1). 마지막 확인 성공 시각도 그대로. 이번에 읽은 프로젝트만. */
async function markCollectError(db: SupabaseClient, t: Target, kind: ErrorKind) {
  const m = await db.from("my_technologies").update({ collect_error_kind: kind }).eq("project_id", t.projectId).eq("tech_id", t.techId);
  if (m.error) throw new Error(`수집 오류를 저장하지 못함: ${m.error.message}`);
}

