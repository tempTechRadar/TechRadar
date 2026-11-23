// 내 기술 목록을 바꾸고 읽는 서버 함수(PRD-F7·F10, IA-3·4). 주인: 김영식(A).
// 바꾸는 일은 사용자 본인 로그인(db)으로 해서 남의 줄은 RLS가 한 번 더 막는다(불변 5).
// 바꾼 기록(audit_logs)만 서비스 키 연결(audit)로 남긴다: erd 4절 "쓰기는 서버". 기록이 실패해도 이미 바뀐 목록은 되돌리지 않고 auditFailed로 알린다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Grade } from "../domain/grade.ts";
import { isUuid, searchTerm } from "../domain/my-tech-view.ts";
import { maskSecrets } from "../domain/redact.ts";
import { looksSecret } from "../install/validate-item.ts";

export type Ctx = { db: SupabaseClient; audit: SupabaseClient | null; userId: string };
export type FailCode = "not_found" | "failed" | "duplicate" | "no_target" | "name" | "secret" | "version" | "project" | "archived";
type Fail = { ok: false; code: FailCode };
export type ChangeResult = { ok: true; changed: boolean; auditFailed: boolean } | Fail;
export type AddResult = { ok: true; id: string; auditFailed: boolean } | Fail;

// 화면에는 코드만 돌려주고, DB가 한 말은 서버 로그에만 남긴다.
function fail(code: FailCode, detail?: string): Fail {
  if (detail) console.error(`사용 중인 항목 ${code}`, maskSecrets(detail));
  return { ok: false, code };
}

async function writeAudit({ audit, userId }: Ctx, action: string, targetId: string): Promise<boolean> {
  const r = audit
    ? await audit.from("audit_logs").insert({ actor_id: userId, actor_role: "user", action, target_table: "my_technologies", target_id: targetId })
    : { error: { message: "서비스 키 연결이 없어요" } };
  if (r.error) console.error("바꾼 기록을 남기지 못함", maskSecrets(r.error.message));
  return !r.error;
}

/** 직접 숨기기·되돌리기(PRD-F7). 이미 그 상태면 바꾸지도 기록을 남기지도 않는다. 본인 줄이 아니면 "없음"으로 답한다. */
export async function setTechHidden(ctx: Ctx, id: string, hidden: boolean): Promise<ChangeResult> {
  if (!isUuid(id)) return fail("not_found");
  const { db, userId } = ctx;
  const found = await db.from("my_technologies").select("id, hidden_at").eq("id", id).eq("owner_id", userId).maybeSingle();
  if (found.error) return fail("failed", found.error.message);
  if (!found.data) return fail("not_found");
  if (Boolean(found.data.hidden_at) === hidden) return { ok: true, changed: false, auditFailed: false };
  const upd = await db.from("my_technologies").update({ hidden_at: hidden ? new Date().toISOString() : null }).eq("id", id).eq("owner_id", userId).select("id");
  if (upd.error || !upd.data?.length) return fail("failed", upd.error?.message ?? "바뀐 줄이 없음");
  return { ok: true, changed: true, auditFailed: !(await writeAudit(ctx, hidden ? "tech_hide" : "tech_restore", id)) };
}

export type NewTech = { projectId: string; techId: string | null; name: string; version: string };

/** 직접 추가 입력 검사. 카탈로그에서 골랐으면 이름은 쓰지 않고, 이름만 쓸 때는 비밀값처럼 보이는 글을 막는다. */
export function checkNewTech(input: NewTech): { ok: true; name: string | null; version: string | null } | Fail {
  if (input.techId && !isUuid(input.techId)) return { ok: false, code: "no_target" };
  const name = input.techId ? "" : input.name.trim();
  if (!input.techId && !name) return { ok: false, code: "no_target" };
  if (name.length > 80) return { ok: false, code: "name" };
  const version = input.version.trim();
  if (version && !/^[\w.+-]{1,40}$/.test(version)) return { ok: false, code: "version" };
  if (looksSecret(name) || looksSecret(version)) return { ok: false, code: "secret" };
  return { ok: true, name: name || null, version: version || null };
}

/**
 * 직접 추가(PRD-F7). 이름만 쓴 기술은 등급 "찾지 못함"으로 남는다. 이 함수는 등급 칸을 보내지 않고,
 * `202611181900_P-11_my_tech_insert_columns.sql`을 DB에 적용하면 API로 직접 넣어도 insert 열이 7칸·origin이 manual·import로 막힌다.
 * 적용한 뒤 여기서 보내는 칸이 늘면 DB가 저장을 거절하므로 `my-tech-insert-columns.test.ts`가 먼저 실패한다.
 * 이름·버전의 길이·모양·비밀값 검사는 아직 이 함수(checkNewTech)에만 있고 DB에는 없다(intent 열린 질문).
 * 남의 프로젝트에는 넣을 수 없다: 사용자 본인 연결이라 `my_tech_insert` 정책의 with check가 프로젝트 주인을 확인한다.
 */
export async function addTech(ctx: Ctx, input: NewTech): Promise<AddResult> {
  if (!isUuid(input.projectId)) return fail("project");
  const checked = checkNewTech(input);
  if (!checked.ok) return checked;
  // 보관한 프로젝트에는 넣지 않는다: 넣어도 목록·지도 어디에도 안 보이는데 "추가했어요"가 뜨게 된다(불변 2·4). 내 프로젝트가 아니면 "프로젝트를 고를 수 없어요".
  const proj = await ctx.db.from("projects").select("id, archived_at").eq("id", input.projectId).eq("owner_id", ctx.userId).maybeSingle();
  if (proj.error) return fail("failed", proj.error.message);
  if (!proj.data) return fail("project");
  if (proj.data.archived_at) return fail("archived");
  const row = { owner_id: ctx.userId, added_by: ctx.userId, project_id: input.projectId, tech_id: input.techId || null, manual_name: checked.name, origin: "manual", version: checked.version };
  const r = await ctx.db.from("my_technologies").insert(row).select("id").single();
  if (r.error || !r.data) return fail(r.error?.code === "23505" ? "duplicate" : "failed", r.error?.message ?? "빈 응답");
  return { ok: true, id: r.data.id as string, auditFailed: !(await writeAudit(ctx, "tech_add", r.data.id as string)) };
}

export type CatalogHit = { id: string; tech_key: string; display_name: string; type: string };

/** 모은 기술에서 검색(PRD-F7). 검색어는 여기서 정리한다(거르기 문법이 끼어들지 못하게, 쿼리 바로 옆에서). 시연용 가짜 기술은 빼고, 못 읽으면 던진다(화면이 "조회 실패"로 보여 줌). */
export async function searchCatalog(db: SupabaseClient, raw: string): Promise<CatalogHit[]> {
  const term = searchTerm(raw);
  if (!term) return [];
  const r = await db.from("technologies").select("id, tech_key, display_name, type").eq("is_simulated", false)
    .or(`display_name.ilike.%${term}%,tech_key.ilike.%${term}%`).order("display_name").limit(10);
  if (r.error || !r.data) throw new Error(`기술 검색 실패: ${maskSecrets(r.error?.message ?? "빈 응답")}`);
  return r.data as CatalogHit[];
}

export type TechInfo = {
  id: string; tech_key: string; display_name: string; type: string; status: string; one_liner: string | null; repo_url: string | null;
  one_liner_ko?: string | null; one_liner_ko_src?: string | null; one_liner_ko_at?: string | null; one_liner_source?: string | null; // P-12r: 화면은 koOf로 고른다
  license: string | null; last_activity_at: string | null; last_activity_kind: string | null; is_official: boolean; last_checked_ok_at: string | null;
};
export type MyTechDetail = {
  id: string; origin: string; source_file: string | null; version: string | null; manual_name: string | null; hidden_at: string | null;
  read_at: string | null; collect_error_kind: string | null; grade: Grade; grade_reason: string | null; grade_evidence: unknown;
  grade_rule_version: string | null; graded_at: string | null; last_checked_ok_at: string | null;
  projects: { name: string } | null; technologies: TechInfo | null;
};

const DETAIL_COLUMNS = "id, origin, source_file, version, manual_name, hidden_at, read_at, collect_error_kind, grade, grade_reason, grade_evidence, grade_rule_version, graded_at, last_checked_ok_at, "
  + "projects(name), technologies(id, tech_key, display_name, type, status, one_liner, one_liner_ko, one_liner_ko_src, one_liner_ko_at, one_liner_source, repo_url, license, last_activity_at, last_activity_kind, is_official, last_checked_ok_at)";

/** 기술 상세(IA-4). 본인 줄만. 없으면 null, 읽기에 실패하면 던진다. */
export async function getMyTechDetail(db: SupabaseClient, userId: string, id: string): Promise<MyTechDetail | null> {
  const r = await db.from("my_technologies").select(DETAIL_COLUMNS).eq("id", id).eq("owner_id", userId).maybeSingle();
  if (r.error) throw new Error(`기술 상세 읽기 실패: ${maskSecrets(r.error.message)}`);
  // DB 타입을 만들기 전이라 다대일(projects·technologies)도 배열로 추론된다. 실제 응답은 한 줄 객체.
  return (r.data as unknown as MyTechDetail | null) ?? null;
}

/**
 * 등급 이유를 연 기록(주 숫자, erd grade_views). 주 숫자는 "열어 본 기술이 하나라도 있는가"라서, 이미 있으면 새로 쓰지 않는다
 * (화면을 새로 고칠 때마다 줄이 쌓이지 않게). 못 읽거나 못 남겨도 화면은 그대로 보여 주고 false만 돌려준다.
 */
export async function recordGradeView({ db, userId }: Ctx, techId: string): Promise<boolean> {
  const seen = await db.from("grade_views").select("tech_id").eq("user_id", userId).eq("tech_id", techId).limit(1);
  if (seen.error) {
    console.error("등급 열람 기록 확인 실패", maskSecrets(seen.error.message));
    return false;
  }
  if (seen.data?.length) return true;
  const r = await db.from("grade_views").insert({ user_id: userId, tech_id: techId });
  if (r.error) console.error("등급 열람 기록 실패", maskSecrets(r.error.message));
  return !r.error;
}
