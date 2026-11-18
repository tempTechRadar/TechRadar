// 시뮬레이터 두 번째 시나리오(P-5b, SPEC-3.5 셋째 줄): 적용 기회 알림을 보여 주려고
// 가짜 새 기술 1개 + 시연 계정 기술과의 **확정된 같은 역할 관계**(가짜 표시)를 넣고, 같은 역할 새 기술 변경 → 적용 기회 알림까지 돈다.
// 조건(SPEC-3.2: 확정 · 등록 이후 · 위험 아님)은 우회하지 않고 진짜로 맞춘다: 관계는 confirmed, 새 기술은 지금 만들어 등급 통과.
// 판정은 createAlertsForChange(황재웅 B, 적용 기회 규칙)가 그대로 한다. 주인: 차세일(C).
import type { SupabaseClient } from "@supabase/supabase-js";
import { finishRun, recordStep, startRun } from "./run-log.ts";
import { assertSimulatedChange, done, fail, upsertSource, type Flow, type SimulatorDeps } from "./simulator.ts";

export type OpportunityResult =
  | { started: false; reason: string }
  | { started: true; runId: string; changeId: string; changeCreated: boolean; alertsCreated: number; note: string };

// "sim:" 접두어 키는 진짜 패키지 키(npm:·pypi:·skill:·url:)와 절대 겹치지 않는다
const NEW_TECH = { key: "sim:techradar-demo-new-tool", name: "시연용 새 도구(가짜)" };

type DemoTech = { techId: string; techKey: string };

/** 시연 계정이 쓰는 진짜 기술 하나(기술 키 이름순 첫째). 없으면 null(관계를 만들 상대가 없음) */
export async function pickDemoTech(db: SupabaseClient): Promise<DemoTech | null> {
  const demo = await db.from("profiles").select("id").eq("is_demo", true);
  if (demo.error) throw fail("시연 계정을 읽지 못함", demo.error.message);
  const ids = ((demo.data ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return null;
  const mine = await db.from("my_technologies").select("tech_id, technologies(tech_key, is_simulated)").in("owner_id", ids).is("hidden_at", null);
  if (mine.error) throw fail("시연 계정의 내 기술을 읽지 못함", mine.error.message);
  type Row = { tech_id: string | null; technologies: { tech_key: string; is_simulated: boolean } | null };
  const real = ((mine.data ?? []) as unknown as Row[])
    .filter((r) => r.tech_id && r.technologies && !r.technologies.is_simulated)
    .map((r) => ({ techId: r.tech_id!, techKey: r.technologies!.tech_key }))
    .sort((a, b) => (a.techKey < b.techKey ? -1 : a.techKey > b.techKey ? 1 : 0));
  return real[0] ?? null;
}

/** 가짜 새 기술: 이미 있으면 그대로, 없으면 만든다(가짜 표시, 등급 통과 = 위험 아님) */
async function ensureNewTech(db: SupabaseClient): Promise<string> {
  const row = { tech_key: NEW_TECH.key, display_name: NEW_TECH.name, type: "mcp", grade: "pass", grade_reason: "시뮬레이터 가짜 기술", is_simulated: true };
  const made = await db.from("technologies").upsert(row, { onConflict: "tech_key", ignoreDuplicates: true }).select("id");
  if (made.error) throw fail("가짜 새 기술을 만들지 못함", made.error.message);
  const rows = (made.data ?? []) as { id: string }[];
  if (rows.length > 0) return rows[0].id;
  const again = await db.from("technologies").select("id, is_simulated").eq("tech_key", NEW_TECH.key).single();
  if (again.error || !again.data) throw fail("가짜 새 기술을 다시 찾지 못함", again.error?.message);
  if ((again.data as { is_simulated: boolean }).is_simulated !== true) throw new Error("가짜 새 기술 키가 진짜 기술과 겹침: 멈춤");
  return (again.data as { id: string }).id;
}

/** 확정된 같은 역할 관계(가짜 표시). 짝은 작은 id가 a(DB 제약). 누른 관리자가 확정한 것으로 남긴다(ADR 0015) */
async function ensureRelation(db: SupabaseClient, newTechId: string, demoTechId: string, adminId: string): Promise<void> {
  const [a, b] = [newTechId, demoTechId].sort();
  const row = { tech_a: a, tech_b: b, kind: "same_role", status: "confirmed", made_by: "seed", confirmed_by: adminId, confirmed_at: new Date().toISOString(), quote: "시뮬레이터 가짜 관계", is_simulated: true };
  const { error } = await db.from("tech_relations").upsert(row, { onConflict: "tech_a,tech_b,kind", ignoreDuplicates: true });
  if (error) throw fail("가짜 같은 역할 관계를 만들지 못함", error.message);
}

async function insertObservation(db: SupabaseClient, ids: { sourceId: string; techId: string; runId: string }, demoKey: string): Promise<string> {
  const row = {
    source_id: ids.sourceId, tech_id: ids.techId, metric: "same_role", prev_value: null, curr_value: { sameRoleAs: demoKey, grade: "pass" },
    change_size: "large", run_id: ids.runId, observed_at: new Date().toISOString(), is_simulated: true,
  };
  const { data, error } = await db.from("observations").insert(row).select("id").single();
  if (error || !data) throw fail("가짜 수집 자료를 저장하지 못함", error?.message);
  return data.id as string;
}

type Ctx = { deps: SimulatorDeps; flow: Flow; demo: DemoTech; adminId: string };

async function collect(ctx: Ctx): Promise<{ newTechId: string; observationId: string }> {
  const { deps, flow, demo } = ctx;
  const sourceId = await upsertSource(deps.db);
  const newTechId = await ensureNewTech(deps.db);
  await ensureRelation(deps.db, newTechId, demo.techId, ctx.adminId);
  await done(deps, flow, { stepName: "normalize", countIn: 1, countOut: 1, outputSummary: `${NEW_TECH.key} (가짜 새 기술), 같은 역할: ${demo.techKey}(확정, 가짜 관계)` });
  flow.current = "compare";
  const observationId = await insertObservation(deps.db, { sourceId, techId: newTechId, runId: flow.runId }, demo.techKey);
  await done(deps, flow, { stepName: "compare", countIn: 1, countOut: 1, outputSummary: "카탈로그에 없던 기술 → 새로 들어옴(가짜 자료 1줄)" });
  flow.current = "grade";
  await done(deps, flow, { stepName: "grade", countIn: 1, countOut: 1, outputSummary: "통과(위험 아님)" });
  flow.current = "is_event";
  await done(deps, flow, { stepName: "is_event", countIn: 1, countOut: 1, branchCounts: { event: 1, no_change: 0, collect_error: 0 } });
  return { newTechId, observationId };
}

async function saveAndNotify(ctx: Ctx, ids: { newTechId: string; observationId: string }) {
  const { deps, flow, demo } = ctx;
  flow.current = "save_change";
  const change = await deps.saveChange(deps.db, {
    kind: "same_role_new", techId: ids.newTechId, tech: { key: NEW_TECH.key, version: null }, causeId: `sim:same_role:${demo.techKey}`,
    currValue: { sameRoleAs: demo.techKey }, observationId: ids.observationId, isSimulated: true,
  });
  if (!change.created) await assertSimulatedChange(deps.db, change.id);
  await done(deps, flow, { stepName: "save_change", countIn: 1, countOut: 1, outputSummary: change.created ? "새 변경 1건 저장" : "이미 있는 변경(새로 만들지 않음)" });
  flow.current = "notify"; // createAlertsForChange가 직접 기록한다(실패도)
  const alertsCreated = await deps.createAlertsForChange(deps.db, { changeId: change.id, techId: ids.newTechId, kind: "opportunity", runId: flow.runId });
  if (alertsCreated > 0) {
    flow.current = "human_judgment";
    await recordStep(deps.db, flow.runId, { stepName: "human_judgment", status: "awaiting_judgment", countIn: alertsCreated, outputSummary: `시연 계정 ${alertsCreated}명이 판단 대기(적용 기회)` });
  }
  await finishRun(deps.db, flow.runId, { status: "succeeded", itemCount: 1 });
  const note = alertsCreated > 0
    ? `적용 기회 알림 ${alertsCreated}건(시연 계정, ${demo.techKey}와 같은 역할)`
    : `알림 0건: 이 변경의 알림이 이미 있거나, 시연 계정의 그 기술이 보관한 프로젝트에 있거나, 새 기술을 이미 쓰고 있어요(SPEC-3.2 조건은 그대로 적용).`;
  return { started: true as const, runId: flow.runId, changeId: change.id, changeCreated: change.created, alertsCreated, note };
}

export async function runOpportunitySimulator(deps: SimulatorDeps, input: { adminId: string }): Promise<OpportunityResult> {
  const demo = await pickDemoTech(deps.db);
  if (!demo) return { started: false, reason: "시연 계정에 내 기술이 없어 같은 역할 관계를 만들 상대가 없어요. 시연 계정으로 저장소를 먼저 등록해 주세요." };
  const runId = await startRun(deps.db, { trigger: "simulator", startedBy: input.adminId });
  const ctx: Ctx = { deps, flow: { runId, current: "normalize" }, demo, adminId: input.adminId };
  try {
    return await saveAndNotify(ctx, await collect(ctx));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (ctx.flow.current !== "notify") await recordStep(deps.db, runId, { stepName: ctx.flow.current, status: "failed", errorMessage: message }).catch(() => {});
    await finishRun(deps.db, runId, { status: "failed" }).catch(() => {});
    throw error;
  }
}
