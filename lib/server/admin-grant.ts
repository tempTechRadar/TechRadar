// 관리자가 일반 계정을 관리자로 지정하고(작업 I-P-admin-grant), 다른 관리자를 일반으로 되돌린다(I-P-admin-revoke). IA-12, 불변 5. 주인: 차세일(C, 관리자 화면).
// 바꾸기는 관리자 본인 로그인(db)으로 DB 함수 admin_grant_admin(202611232300) · admin_revoke_admin(202611240000)만 부른다.
// 두 함수는 역할 변경 잠금을 잡은 뒤 부른 사람이 관리자인지 다시 확인하고, 역할 변경과 바꾼 기록(audit_logs: 담당자·시각·사유)을 함께 쓴다. 서비스 키는 쓰지 않는다.
// 상대 경로 import: node --test가 `@/`를 못 읽는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkReason } from "../admin/classify-input.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import { maskSecrets } from "../domain/redact.ts";

export type GrantCode = "granted" | "already" | "reason" | "not_found" | "demo" | "forbidden" | "missing" | "failed" | "no_db";
export type RevokeCode = "revoked" | "not_admin" | "self" | "last_admin" | "reason" | "not_found" | "forbidden" | "missing" | "failed" | "no_db";
export type RevokeResult = { ok: boolean; code: RevokeCode };
export type GrantResult = { ok: boolean; code: GrantCode };

const DB_ANSWERS: readonly GrantCode[] = ["granted", "already", "reason", "not_found", "demo"];
const REVOKE_ANSWERS: readonly RevokeCode[] = ["revoked", "not_admin", "self", "last_admin", "reason", "not_found"];

/** 화면에 보일 문장. DB가 한 말은 서버 로그에만 남긴다. */
export const GRANT_TEXT: Record<GrantCode, string> = {
  granted: "관리자로 지정했어요. 바꾼 기록(담당자·시각·사유)도 남겼어요. 그 사람은 다시 들어오면 관리자 메뉴가 보여요.",
  already: "이미 관리자라 바꾸지 않았어요.",
  reason: "사유를 5자 이상 300자 이하로 써 주세요(비밀값은 쓰지 마세요).",
  not_found: "그 회원을 찾지 못했어요. 새로고침해 주세요.",
  demo: "시연 계정은 여럿이 같이 쓰는 로그인이라 관리자로 지정할 수 없어요.",
  forbidden: "관리자만 할 수 있어요.",
  missing: "관리자 지정 기능이 아직 DB에 준비되지 않았어요(마이그레이션 적용 대기). 아무것도 바뀌지 않았어요.",
  failed: "저장하지 못했어요. 아무것도 바뀌지 않았어요.",
  no_db: "DB에 연결하지 못했어요(설정 또는 로그인 만료). 아무것도 바뀌지 않았어요.",
};

function fail(code: GrantCode, detail?: string, label = "관리자 지정"): GrantResult {
  if (detail) console.error(`${label} ${code}`, maskSecrets(detail));
  return { ok: false, code };
}

type Called = { answer: string } | { error: "reason" | "not_found" | "forbidden" | "missing" | "failed" };

/** 입력은 서버에서 먼저 거르고(사유·형식), 권한·대상 상태는 DB 함수가 다시 본다. 지정·되돌리기가 같은 길을 쓴다. */
async function callRoleFn(db: SupabaseClient, fn: string, targetId: string, rawReason: string): Promise<Called> {
  const label = fn === "admin_revoke_admin" ? "관리자 되돌리기" : "관리자 지정";
  const why = checkReason(rawReason);
  // DB는 글자 수를 char_length(코드 포인트)로 센다. 이모지 같은 글자가 서버에서만 2자로 세지지 않게 같은 방법으로 한 번 더 본다
  if (!why.ok || [...why.reason].length < 5) return { error: "reason" };
  if (!isUuid(targetId)) return { error: "not_found" };
  const r = await db.rpc(fn, { p_target: targetId, p_reason: why.reason });
  if (r.error) {
    const code = r.error.code ?? "";
    const tag = `${fn} 실패`;
    // PGRST202: 함수가 없음(운영에 마이그레이션 전). 42883: 같은 뜻의 Postgres 코드
    if (code === "PGRST202" || code === "42883") { fail("missing", `${tag}: ${r.error.message}`, label); return { error: "missing" }; }
    if (code === "42501") { fail("forbidden", `${tag}: ${r.error.message}`, label); return { error: "forbidden" }; }
    fail("failed", `${tag}: ${r.error.message}`, label);
    return { error: "failed" };
  }
  return { answer: String(r.data) };
}

/** targetId를 관리자로. */
export async function grantAdmin(db: SupabaseClient, targetId: string, rawReason: string): Promise<GrantResult> {
  const c = await callRoleFn(db, "admin_grant_admin", targetId, rawReason);
  if ("error" in c) return { ok: false, code: c.error };
  const answer = DB_ANSWERS.find((x) => x === c.answer);
  if (!answer) return fail("failed", `알 수 없는 답: ${c.answer}`);
  return { ok: answer === "granted" || answer === "already", code: answer };
}

/** 화면에 보일 문장(되돌리기). */
export const REVOKE_TEXT: Record<RevokeCode, string> = {
  revoked: "일반 계정으로 되돌렸어요. 바꾼 기록(담당자·시각·사유)도 남겼어요. 그 사람은 다시 들어오면 관리자 메뉴가 사라져요.",
  not_admin: "이미 일반 계정이라 바꾸지 않았어요.",
  self: "자기 자신은 되돌릴 수 없어요. 다른 관리자에게 부탁해 주세요. 아무것도 바뀌지 않았어요.",
  last_admin: "관리자가 한 명만 남게 돼서 되돌릴 수 없어요. 아무것도 바뀌지 않았어요.",
  reason: GRANT_TEXT.reason,
  not_found: GRANT_TEXT.not_found,
  forbidden: GRANT_TEXT.forbidden,
  missing: "되돌리기 기능이 아직 DB에 준비되지 않았어요(마이그레이션 적용 대기). 아무것도 바뀌지 않았어요.",
  failed: GRANT_TEXT.failed,
  no_db: GRANT_TEXT.no_db,
};

/** 다른 관리자를 일반 계정으로. 자기 자신·마지막 관리자는 DB가 거절한다. */
export async function revokeAdmin(db: SupabaseClient, targetId: string, rawReason: string): Promise<RevokeResult> {
  const c = await callRoleFn(db, "admin_revoke_admin", targetId, rawReason);
  if ("error" in c) return { ok: false, code: c.error };
  const answer = REVOKE_ANSWERS.find((x) => x === c.answer);
  if (!answer) { fail("failed", `알 수 없는 답: ${c.answer}`, "관리자 되돌리기"); return { ok: false, code: "failed" }; }
  return { ok: answer === "revoked" || answer === "not_admin", code: answer };
}
