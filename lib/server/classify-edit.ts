// 같은 역할 확정·규칙 목록 고치기(P-18b)·갈래 확정(P-18c), PRD-F24·F27, IA-17, ADR 0015.
// 바꾸기는 관리자 본인 로그인(db)으로만 해서 RLS가 한 번 더 막는다(불변 5). 일반 계정이면 0줄이 바뀌고 실패로 끝난다.
// 바꾼 기록(audit_logs: 담당자·시각·사유)은 서버 연결(audit)로만 쓴다(erd 4절 "쓰기는 서버").
// 기록이 실패해도 이미 바뀐 것은 되돌리지 않고 auditFailed로 알린다(lib/server/my-tech.ts와 같은 방식).
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkNewRule, checkReason, type RuleInput } from "../admin/classify-input.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import { maskSecrets } from "../domain/redact.ts";

export type EditCtx = { db: SupabaseClient; audit: SupabaseClient | null; userId: string };
export type EditFail = "not_found" | "failed" | "duplicate" | "reason" | "input";
export type EditResult = { ok: true; changed: boolean; auditFailed: boolean } | { ok: false; code: EditFail };

// 화면에는 코드만 돌려주고, DB가 한 말은 서버 로그에만 남긴다.
function fail(code: EditFail, detail?: string): { ok: false; code: EditFail } {
  if (detail) console.error(`분류 확인 ${code}`, maskSecrets(detail));
  return { ok: false, code };
}

async function writeAudit(ctx: EditCtx, action: string, table: string, targetId: string, reason: string): Promise<boolean> {
  const r = ctx.audit
    ? await ctx.audit.from("audit_logs").insert({ actor_id: ctx.userId, actor_role: "admin", action, target_table: table, target_id: targetId, reason })
    : { error: { message: "서비스 키 연결이 없어요" } };
  if (r.error) console.error("바꾼 기록을 남기지 못함", maskSecrets(r.error.message));
  return !r.error;
}

/** 같은 역할 후보를 확정한다. 확정한 사람 = 나, 시각 = 지금. 이미 확정이면 그대로 둔다. */
export async function confirmRelation(ctx: EditCtx, id: string, rawReason: string): Promise<EditResult> {
  const why = checkReason(rawReason);
  if (!why.ok) return fail("reason");
  if (!isUuid(id)) return fail("not_found");
  const found = await ctx.db.from("tech_relations").select("id, status").eq("id", id).maybeSingle();
  if (found.error) return fail("failed", found.error.message);
  if (!found.data) return fail("not_found");
  if (found.data.status === "confirmed") return { ok: true, changed: false, auditFailed: false };
  const upd = await ctx.db.from("tech_relations")
    .update({ status: "confirmed", confirmed_by: ctx.userId, confirmed_at: new Date().toISOString() })
    .eq("id", id).eq("status", "candidate").select("id");
  if (upd.error || !upd.data?.length) return fail("failed", upd.error?.message ?? "바뀐 줄이 없음(권한 또는 이미 확정)");
  return { ok: true, changed: true, auditFailed: !(await writeAudit(ctx, "relation_confirm", "tech_relations", id, why.reason)) };
}

/** 규칙 한 줄을 켜거나 끈다. 같은 상태면 그대로 둔다. */
export async function setRuleEnabled(ctx: EditCtx, id: string, enabled: boolean, rawReason: string): Promise<EditResult> {
  const why = checkReason(rawReason);
  if (!why.ok) return fail("reason");
  if (!isUuid(id)) return fail("not_found");
  const found = await ctx.db.from("rule_lists").select("id, enabled").eq("id", id).maybeSingle();
  if (found.error) return fail("failed", found.error.message);
  if (!found.data) return fail("not_found");
  if (found.data.enabled === enabled) return { ok: true, changed: false, auditFailed: false };
  const upd = await ctx.db.from("rule_lists").update({ enabled, updated_by: ctx.userId }).eq("id", id).select("id");
  if (upd.error || !upd.data?.length) return fail("failed", upd.error?.message ?? "바뀐 줄이 없음(권한)");
  return { ok: true, changed: true, auditFailed: !(await writeAudit(ctx, enabled ? "rule_enable" : "rule_disable", "rule_lists", id, why.reason)) };
}

/** 규칙을 한 줄 더한다(허용 패키지·GitHub 태그·HN 낱말·공식 조직). 같은 규칙이 있으면 duplicate. */
export async function addRule(ctx: EditCtx, input: RuleInput, rawReason: string): Promise<EditResult> {
  const checked = checkNewRule(input);
  if (!checked.ok) return fail("input");
  const why = checkReason(rawReason);
  if (!why.ok) return fail("reason");
  const ins = await ctx.db.from("rule_lists").insert({ ...checked.rule, updated_by: ctx.userId }).select("id").single();
  if (ins.error?.code === "23505") return fail("duplicate");
  if (ins.error || !ins.data) return fail("failed", ins.error?.message ?? "넣은 줄이 없음");
  return { ok: true, changed: true, auditFailed: !(await writeAudit(ctx, "rule_add", "rule_lists", String(ins.data.id), why.reason)) };
}

/**
 * 기술의 갈래를 정하거나 고친다(P-18c). 작은 갈래(부모가 있는 갈래)만 받는다. 갈래·정한 사람(나)·시각 세 칸만 바꾼다:
 * DB도 이 세 칸만 관리자에게 열었다(202611191500_P-18c_category_admin.sql). 같은 갈래면 그대로 둔다.
 */
export async function setCategory(ctx: EditCtx, techId: string, categoryId: string, rawReason: string): Promise<EditResult> {
  const why = checkReason(rawReason);
  if (!why.ok) return fail("reason");
  if (!isUuid(techId) || !isUuid(categoryId)) return fail("not_found");
  const cat = await ctx.db.from("categories").select("id, parent_id").eq("id", categoryId).maybeSingle();
  if (cat.error) return fail("failed", cat.error.message);
  if (!cat.data) return fail("not_found");
  if (!cat.data.parent_id) return fail("input");
  const tech = await ctx.db.from("technologies").select("id, category_id").eq("id", techId).maybeSingle();
  if (tech.error) return fail("failed", tech.error.message);
  if (!tech.data) return fail("not_found");
  if (tech.data.category_id === categoryId) return { ok: true, changed: false, auditFailed: false };
  const upd = await ctx.db.from("technologies")
    .update({ category_id: categoryId, category_set_by: ctx.userId, category_set_at: new Date().toISOString() })
    .eq("id", techId).select("id");
  if (upd.error || !upd.data?.length) return fail("failed", upd.error?.message ?? "바뀐 줄이 없음(권한)");
  return { ok: true, changed: true, auditFailed: !(await writeAudit(ctx, "category_set", "technologies", techId, why.reason)) };
}

export type ClassifyNowResult = { ok: true; items: number; summary: string; auditFailed: boolean } | { ok: false; code: EditFail };

/**
 * "규칙으로 한 번에 분류"(P-12f ⑧): 갈래가 비고 관리자가 정하지 않은 기술을 지금 규칙으로 채운다. 하는 일은 매일 실행 뒤에 도는 classifyCatalog와 같고(run으로 받음),
 * 관리자가 정한 것 · 시뮬레이터는 건드리지 않고 규칙으로 못 정한 것은 비워 둔다. 같은 줄을 다시 채우지 않으니 여러 번 눌러도 같다(불변 3).
 * 중간에 실패해도 이미 정한 갈래는 그대로라 다시 누르면 남은 것부터 이어 한다. 성공도 실패도 담당자 · 시각 · 사유를 남긴다(audit_logs).
 */
export async function classifyNow(ctx: EditCtx, run: () => Promise<{ items: number; summary: string }>, rawReason: string): Promise<ClassifyNowResult> {
  const why = checkReason(rawReason);
  if (!why.ok) return fail("reason");
  let out: { items: number; summary: string };
  try {
    out = await run();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await writeAudit(ctx, "classify_all", "technologies", "catalog", `${why.reason} (실패: ${maskSecrets(message)})`); // 일부는 저장됐을 수 있어 실패도 남긴다
    return fail("failed", message);
  }
  const auditFailed = !(await writeAudit(ctx, "classify_all", "technologies", "catalog", `${why.reason} (결과: ${out.summary})`));
  return { ok: true, items: out.items, summary: out.summary, auditFailed };
}
