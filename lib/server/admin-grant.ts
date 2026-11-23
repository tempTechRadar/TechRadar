// 관리자가 일반 계정을 관리자로 지정(작업 I-P-admin-grant, IA-12, 불변 5). 주인: 차세일(C, 관리자 화면).
// 바꾸기는 관리자 본인 로그인(db)으로 DB 함수 admin_grant_admin만 부른다. 함수가 관리자인지 다시 확인하고, 역할 변경과
// 바꾼 기록(audit_logs: 담당자·시각·사유)을 함께 쓴다(202611232300). 서비스 키는 쓰지 않는다.
// 상대 경로 import: node --test가 `@/`를 못 읽는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkReason } from "../admin/classify-input.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import { maskSecrets } from "../domain/redact.ts";

export type GrantCode = "granted" | "already" | "reason" | "not_found" | "demo" | "forbidden" | "missing" | "failed" | "no_db";
export type GrantResult = { ok: boolean; code: GrantCode };

const DB_ANSWERS: readonly GrantCode[] = ["granted", "already", "reason", "not_found", "demo"];

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

function fail(code: GrantCode, detail?: string): GrantResult {
  if (detail) console.error(`관리자 지정 ${code}`, maskSecrets(detail));
  return { ok: false, code };
}

/** targetId를 관리자로. 입력은 서버에서 먼저 거르고(사유·형식), 권한·대상 상태는 DB 함수가 다시 본다. */
export async function grantAdmin(db: SupabaseClient, targetId: string, rawReason: string): Promise<GrantResult> {
  const why = checkReason(rawReason);
  // DB는 글자 수를 char_length(코드 포인트)로 센다. 이모지 같은 글자가 서버에서만 2자로 세지지 않게 같은 방법으로 한 번 더 본다
  if (!why.ok || [...why.reason].length < 5) return fail("reason");
  if (!isUuid(targetId)) return fail("not_found");
  const r = await db.rpc("admin_grant_admin", { p_target: targetId, p_reason: why.reason });
  if (r.error) {
    const code = r.error.code ?? "";
    // PGRST202: 함수가 없음(운영에 마이그레이션 전). 42883: 같은 뜻의 Postgres 코드
    if (code === "PGRST202" || code === "42883") return fail("missing", r.error.message);
    if (code === "42501") return fail("forbidden", r.error.message);
    return fail("failed", r.error.message);
  }
  const answer = DB_ANSWERS.find((c) => c === r.data);
  if (!answer) return fail("failed", `알 수 없는 답: ${String(r.data)}`);
  return { ok: answer === "granted" || answer === "already", code: answer };
}
