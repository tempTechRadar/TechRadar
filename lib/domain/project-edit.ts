// 프로젝트 수정 · 보관(PRD-F4 3순위, ADR 0020). 입력 경계에서 쓰는 순수 검사와 화면 문구. 저장은 app/projects/actions.ts(사용자 토큰 + RLS, 본인 것만).
// 보관은 지우지 않는다: 내 기술 · 알림 · 판단 기록은 그대로 둔다. 목록 · 지도 · 숫자에서 빠지고 정기 점검(osv-store) · 새 알림(decide-alerts)도 멈춘다.
import { isUuid } from "./my-tech-view.ts";

export const NAME_MAX = 60, MEMO_MAX = 200;
const len = (s: string) => [...s].length; // DB처럼 코드 포인트로 센다

export type ProjectEdit = { id: string; name: string; memo: string | null };
export type EditCheck = { ok: true; value: ProjectEdit } | { ok: false; error: keyof typeof PROJECT_ERROR_TEXT };

export const PROJECT_ERROR_TEXT = {
  "project-id": "프로젝트를 찾지 못했어요.",
  "project-name": `프로젝트 이름은 1~${NAME_MAX}자로 적어 주세요.`,
  "project-memo": `메모는 ${MEMO_MAX}자까지 적을 수 있어요.`,
  "project-save": "저장하지 못했어요. 다시 시도해 주세요. 프로젝트는 전 그대로예요.",
} as const;

export const PROJECT_NOTICE_TEXT = {
  "project-saved": "프로젝트를 고쳤어요.",
  "project-archived": "보관했어요. 기록은 지우지 않았어요. 보관하는 동안은 점검 · 새 알림이 멈추고, 아래 '보관한 프로젝트'에서 되살릴 수 있어요.",
  "project-unarchived": "되살렸어요. 다음 정기 점검부터 다시 살펴봐요.",
} as const;

/** 폼 값 → 저장할 값. 빈 메모는 null */
export function checkProjectEdit(raw: { id: unknown; name: unknown; memo: unknown }): EditCheck {
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!isUuid(id)) return { ok: false, error: "project-id" };
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (len(name) < 1 || len(name) > NAME_MAX) return { ok: false, error: "project-name" };
  const memo = typeof raw.memo === "string" ? raw.memo.trim() : "";
  if (len(memo) > MEMO_MAX) return { ok: false, error: "project-memo" };
  return { ok: true, value: { id, name, memo: memo || null } };
}

export const isProjectId = (v: unknown): v is string => typeof v === "string" && isUuid(v);
