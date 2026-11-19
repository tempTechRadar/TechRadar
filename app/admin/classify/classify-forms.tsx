// 분류 확인의 고치기 폼(P-18b·18c). 사유를 꼭 받고, 서버 동작이 관리자 확인·검사·기록을 맡는다. 자바스크립트 없이도 동작하는 기본 폼.
import type { CategoryGroup } from "@/lib/admin/category-options";
import { ADDABLE_KINDS } from "@/lib/admin/classify-input";
import type { ClassifyAudit } from "@/lib/server/admin-queries";
import { addRuleAction, confirmRelationAction, setCategoryAction, toggleRuleAction } from "./actions";
import { when } from "../admin-shell";

const BTN = { minHeight: 44, minWidth: 44 } as const;
const ACTION_KO: Record<string, string> = { relation_confirm: "같은 역할 확정", rule_enable: "규칙 켬", rule_disable: "규칙 끔", rule_add: "규칙 추가", category_set: "갈래 정함" };
export const RULE_KO: Record<string, string> = { allow_package: "허용 목록(패키지)", github_topic: "GitHub 태그", hn_keyword: "Hacker News 낱말", risk_pattern: "위험 패턴", official_org: "공식 조직(이름공간)" };

function Reason({ id }: { id: string }) {
  return (
    <label>
      사유 <input name="reason" id={id} required minLength={5} maxLength={300} placeholder="왜 바꾸는지 5자 이상" style={{ minHeight: 44 }} />
    </label>
  );
}

export function ConfirmRelationForm({ id }: { id: string }) {
  return (
    <form action={confirmRelationAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input type="hidden" name="id" value={id} />
      <Reason id={`reason-rel-${id}`} />
      <button type="submit" style={BTN}>같은 역할로 확정</button>
    </form>
  );
}

/** 작은 갈래 고르기 + 사유(P-18c). 큰 갈래는 묶음 제목이라 고를 수 없다. */
export function SetCategoryForm({ techId, groups, current }: { techId: string; groups: CategoryGroup[]; current?: string }) {
  return (
    <form action={setCategoryAction} style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginLeft: 8 }}>
      <input type="hidden" name="techId" value={techId} />
      <label>
        갈래{" "}
        <select name="categoryId" required defaultValue={current ?? ""} style={{ minHeight: 44 }}>
          <option value="" disabled>작은 갈래 고르기</option>
          {groups.map((g) => (
            <optgroup key={g.big} label={g.big}>
              {g.smalls.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <Reason id={`reason-cat-${techId}`} />
      <button type="submit" style={BTN}>{current ? "갈래 고치기" : "갈래 정하기"}</button>
    </form>
  );
}

export function ToggleRuleForm({ id, enabled }: { id: string; enabled: boolean }) {
  return (
    <form action={toggleRuleAction} style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginLeft: 8 }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="enable" value={enabled ? "0" : "1"} />
      <Reason id={`reason-rule-${id}`} />
      <button type="submit" style={BTN}>{enabled ? "끄기" : "켜기"}</button>
    </form>
  );
}

export function AddRuleForm() {
  return (
    <form action={addRuleAction} aria-labelledby="h-add-rule" style={{ display: "grid", gap: 8, maxWidth: 520 }}>
      <h3 id="h-add-rule">새 규칙 더하기</h3>
      <label>종류{" "}
        <select name="kind" required style={{ minHeight: 44 }}>
          {ADDABLE_KINDS.map((k) => <option key={k} value={k}>{RULE_KO[k]}</option>)}
        </select>
      </label>
      <label>생태계(허용 목록만){" "}
        <select name="ecosystem" style={{ minHeight: 44 }}>
          <option value="">— 고르지 않음</option><option value="npm">npm</option><option value="pypi">PyPI</option>
        </select>
      </label>
      <label>값 <input name="value" required maxLength={100} placeholder="예: modelcontextprotocol" style={{ minHeight: 44 }} /></label>
      <Reason id="reason-add-rule" />
      <p className="muted">위험 패턴은 코드 규칙(SPEC-2)과 짝이라 여기서 새로 만들지 않고 켜기·끄기만 해요.</p>
      <button type="submit" style={BTN}>더하기</button>
    </form>
  );
}

export function AuditList({ rows, me }: { rows: ClassifyAudit[]; me: string }) {
  return (
    <section aria-labelledby="h-audit">
      <h2 id="h-audit">최근 바꾼 기록 <span className="muted">(담당자·시각·사유, 최근 {rows.length}건)</span></h2>
      {rows.length === 0 ? <p>아직 바꾼 기록이 없어요.</p> : (
        <ul>
          {rows.map((a, i) => (
            <li key={`${a.at}-${i}`}>
              {when(a.at)} · {ACTION_KO[a.action] ?? a.action} · {a.actorId === me ? "나" : "다른 관리자"}
              <span className="muted"> · 사유: {a.reason ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
