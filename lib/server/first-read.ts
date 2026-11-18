// 등록 → 저장소 읽기 → OSV → 등급 → 변경 (P-3, 주인: 김영식 A). flow 상자: fetch_repo → extract_my_tech → fetch_osv → grade → is_event → save_change → notify
// 쓰기는 서비스 키(erd "쓰기는 서버"). 누구의 것인지는 화면이 아니라 여기서 getCurrentUser로 받은 사람으로 정한다(불변 5).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "./current-user";
import { getServiceSupabase } from "./service-supabase";
import { startRun, recordStep, type RunTrigger, type StepRecord } from "./run-log";
import { saveChange } from "./changes";
import { createAlertsForChange } from "./alerts";
import { REPO_FILES, readMcpJson, readPackageJson, type FoundTech } from "@/lib/domain/manifest";
import { GRADE_RULE_VERSION, gradeFromOsv, type GradeResult, type OsvVuln } from "@/lib/domain/grade";

// shortcut: 사용자당 등록 횟수 제한·백그라운드 실행은 없음. 정기 실행(P-17)에서 OSV 반복을 옮길 때 함께
const MAX_TEXT = 500_000; // 파일·OSV 응답 한도(글자)
const MAX_TECHS = 50; // 저장소 하나에서 읽는 기술 수 한도

type ErrorKind =NonNullable<StepRecord["errorKind"]>;
class CollectError extends Error {
  constructor(readonly kind: ErrorKind, message: string, readonly httpStatus?: number) {
    super(message);
  }
}

/** 바깥 호출 하나. 실패는 오류 종류(SPEC-8)로 나눠 던진다. 404는 null(파일 없음은 오류가 아님). */
async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch (e) {
    const kind = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network";
    throw new CollectError(kind, `${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 404) return null;
  if (res.status === 429) throw new CollectError("rate_limited", `${url}: 429`, 429);
  if (!res.ok) throw new CollectError("http_status", `${url}: ${res.status}`, res.status);
  const text = await res.text();
  if (text.length > MAX_TEXT) throw new CollectError("parse", `${url}: 응답이 너무 큼(${text.length}자)`);
  return text;
}

const errorKindOf = (e: unknown): ErrorKind => (e instanceof CollectError ? e.kind : "parse");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function queryOsv(name: string, ecosystem: "npm" | "PyPI", version: string | null): Promise<OsvVuln[]> {
  const body = JSON.stringify({ package: { name, ecosystem }, ...(version ? { version } : {}) });
  const text = await fetchText("https://api.osv.dev/v1/query", { method: "POST", body, headers: { "content-type": "application/json" } });
  try {
    return (JSON.parse(text ?? "{}") as { vulns?: OsvVuln[] }).vulns ?? [];
  } catch {
    throw new CollectError("parse", "OSV 응답을 해석하지 못함");
  }
}

export type ReadResult = { projectId: string; runId: string; found: number; danger: number; changesCreated: number; errors: number };

/** 공개 GitHub 저장소를 등록(이미 있으면 다시 읽기)하고 끝까지 읽는다. */
export async function registerAndRead(user: CurrentUser, repo: { owner: string; repo: string; url: string }): Promise<ReadResult> {
  const db = getServiceSupabase();
  if (!db) throw new Error("서버에 Supabase 서비스 키가 없다(.env.local)");

  const { projectId, isNew } = await upsertProject(db, user.id, repo);
  const trigger: RunTrigger = isNew ? "first_read" : "user_reread";
  const runId = await startRun(db, { trigger, startedBy: user.id, projectId });

  const { found, fileErrors } = await readRepo(db, runId, repo);
  const techIds = await saveMyTechnologies(db, user.id, projectId, found);
  // 못 읽은 파일에서 전에 읽은 기술은 지우지 않고 수집 오류로(불변 2: "사라짐"으로 단정하지 않음)
  for (const f of fileErrors) {
    const r = await db.from("my_technologies").update({ collect_error_kind: f.kind }).eq("project_id", projectId).eq("source_file", f.path);
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
  for (const g of events) {
    const saved = await saveChange(db, {
      kind: "first_seen_danger", // 사용자가 읽을 때 이미 위험 = 처음 확인한 위험. 정기 수집(P-17)은 grade_to_danger
      techId: g.techId,
      tech: g.f.tech!,
      causeId: g.result.causeId!,
      // shortcut: 위험 회차는 늘 1. 위험 → 고쳐짐 → 다시 위험(SPEC-3.1 회차)은 정기 수집(P-17)에서 이전 변경을 보고 올린다
      currValue: { grade: "danger", reason: g.result.reason, fixed_version: g.result.fixedVersion, evidence: g.result.evidence },
    });
    if (saved.created) changesCreated++;
    await createAlertsForChange(db, { changeId: saved.id, techId: g.techId, kind: "security" });
  }
  await recordStep(db, runId, { stepName: "save_change", status: "succeeded", countIn: events.length, countOut: changesCreated });

  return { projectId, runId, found: found.length, danger: events.length, changesCreated, errors: fileErrors.length + osvErrors };
}

type FileError = { path: string; kind: ErrorKind; message: string };

/** fetch_repo → extract_my_tech. 파일마다 따로: 없는 파일은 건너뛰고, 못 읽거나 깨진 파일은 그 파일만 오류. */
async function readRepo(db: SupabaseClient, runId: string, repo: { owner: string; repo: string; url: string }) {
  const files: { path: string; text: string }[] = [];
  const fileErrors: FileError[] = [];
  for (const path of REPO_FILES) {
    try {
      const text = await fetchText(`https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/HEAD/${path}`);
      if (text !== null) files.push({ path, text });
    } catch (e) {
      fileErrors.push({ path, kind: errorKindOf(e), message: String(e instanceof Error ? e.message : e) });
    }
  }
  await recordStep(db, runId, {
    stepName: "fetch_repo",
    status: fileErrors.length ? "failed" : "succeeded",
    inputSummary: repo.url,
    outputSummary: `읽음 ${files.map((f) => f.path).join(", ") || "없음"}`,
    countIn: REPO_FILES.length,
    countOut: files.length,
    errorKind: fileErrors[0]?.kind,
    errorMessage: fileErrors.map((f) => f.message).join("; ") || undefined,
  });

  // extract_my_tech: 깨진 파일은 해석 실패로 남기고 나머지는 계속.
  const found: FoundTech[] = [];
  for (const f of files) {
    try {
      found.push(...(f.path === "package.json" ? readPackageJson(f.text) : readMcpJson(f.text)));
    } catch (e) {
      fileErrors.push({ path: f.path, kind: "parse", message: `${f.path}: ${e instanceof Error ? e.message : e}` });
    }
  }
  await recordStep(db, runId, {
    stepName: "extract_my_tech",
    status: fileErrors.some((f) => f.kind === "parse") ? "failed" : "succeeded",
    countIn: files.length,
    countOut: found.length,
    outputSummary: found.map((f) => f.tech?.key ?? `찾지 못함:${f.name}`).join(", "),
    errorKind: fileErrors.find((f) => f.kind === "parse") && "parse",
  });
  // 같은 기술이 두 파일에 있으면 한 줄만(package.json 먼저). my_technologies (project_id, tech_id) UK와 맞춘다.
  const seen = new Set<string>();
  const unique = found.filter((f) => !f.tech || (!seen.has(f.tech.key) && seen.add(f.tech.key)));
  // 아무 저장소나 등록할 수 있으니 공용 카탈로그·OSV 호출이 한 번에 커지지 않게 자른다. 잘린 것은 남겨서 보이게
  if (unique.length > MAX_TECHS) fileErrors.push({ path: "(all)", kind: "parse", message: `AI 도구가 ${unique.length}개라 앞의 ${MAX_TECHS}개만 읽음` });
  return { found: unique.slice(0, MAX_TECHS), fileErrors };
}

/** fetch_osv → grade. 한 기술의 실패는 그 기술만 수집 오류, 다른 기술은 계속. */
async function gradeAll(db: SupabaseClient, runId: string, projectId: string, found: FoundTech[], techIds: Map<string, string>) {
  const graded: { f: FoundTech; techId: string; result: GradeResult }[] = [];
  let osvErrors = 0;
  const osvTargets = found.filter((f) => f.tech?.key.startsWith("npm:") || f.tech?.key.startsWith("pypi:"));
  for (const [i, f] of osvTargets.entries()) {
    if (i > 0) await sleep(1000); // SPEC-8 요청 사이 1초
    const techId = techIds.get(f.tech!.key)!;
    const target = { projectId, techId, version: f.tech!.version };
    const [eco, name] = f.tech!.key.startsWith("npm:") ? (["npm", f.tech!.key.slice(4)] as const) : (["PyPI", f.tech!.key.slice(5)] as const);
    try {
      const result = gradeFromOsv(f.tech!.version, await queryOsv(name, eco, f.tech!.version));
      await applyGrade(db, runId, target, result);
      graded.push({ f, techId, result });
    } catch (e) {
      if (!(e instanceof CollectError)) throw e; // DB 오류 등은 삼키지 않는다
      osvErrors++;
      await markCollectError(db, target, e.kind);
    }
  }
  await recordStep(db, runId, {
    stepName: "fetch_osv",
    status: osvErrors ? "failed" : "succeeded",
    countIn: osvTargets.length,
    countOut: graded.length,
    branchCounts: { ok: graded.length, collect_error: osvErrors },
    apiUrl: "https://api.osv.dev/v1/query",
  });
  const byGrade = graded.reduce<Record<string, number>>((m, g) => ({ ...m, [g.result.grade]: (m[g.result.grade] ?? 0) + 1 }), {});
  await recordStep(db, runId, { stepName: "grade", status: "succeeded", countIn: graded.length, countOut: graded.length, branchCounts: byGrade });
  return { graded, osvErrors, osvTargets: osvTargets.length };
}

async function upsertProject(db: SupabaseClient, ownerId: string, repo: { repo: string; url: string }) {
  const existing = await db.from("projects").select("id").eq("owner_id", ownerId).eq("repo_url", repo.url).maybeSingle();
  if (existing.error) throw new Error(`프로젝트를 찾지 못함: ${existing.error.message}`);
  if (existing.data) return { projectId: existing.data.id as string, isNew: false };
  const inserted = await db.from("projects").insert({ owner_id: ownerId, kind: "repo", name: repo.repo, repo_url: repo.url }).select("id").single();
  if (inserted.error) throw new Error(`프로젝트를 저장하지 못함: ${inserted.error.message}`);
  return { projectId: inserted.data.id as string, isNew: true };
}

/** 카탈로그에 기술을 잇고(없으면 만들고) 내 기술 줄을 남긴다. 기술 키 → technologies.id */
async function saveMyTechnologies(db: SupabaseClient, ownerId: string, projectId: string, found: FoundTech[]) {
  const keyed = found.filter((f) => f.tech);
  const ids = new Map<string, string>();
  if (keyed.length) {
    const rows = keyed.map((f) => ({ tech_key: f.tech!.key, display_name: f.name, type: f.type, depth: "thick", thick_reasons: ["user_registered"] }));
    const up = await db.from("technologies").upsert(rows, { onConflict: "tech_key", ignoreDuplicates: true });
    if (up.error) throw new Error(`기술 카탈로그에 저장하지 못함: ${up.error.message}`);
    const sel = await db.from("technologies").select("id, tech_key").in("tech_key", keyed.map((f) => f.tech!.key));
    if (sel.error) throw new Error(`기술 카탈로그를 읽지 못함: ${sel.error.message}`);
    sel.data.forEach((t) => ids.set(t.tech_key, t.id));
  }
  const now = new Date().toISOString();
  const mine = found.map((f) => ({
    owner_id: ownerId,
    added_by: ownerId,
    project_id: projectId,
    origin: "repo",
    source_file: f.sourceFile,
    read_at: now,
    collect_error_kind: null,
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
