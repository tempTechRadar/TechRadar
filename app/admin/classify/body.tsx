// 분류 확인 본문(관리자 화면 문법). 페이지(읽기 · 관리자 확인)와 개발용 견본이 같이 쓴다.
// 고치기(같은 역할 확정 · 규칙 켜기 · 끄기 · 추가 · 갈래 정하기)는 모두 사유를 받고 서버 동작이 관리자 확인 · 기록을 맡는다(classify-forms.tsx → actions.ts).
import { groupRules, type RuleRow } from "@/lib/admin/admin-summaries";
import { categoryOptions, type CategoryGroup } from "@/lib/admin/category-options";
import type { readClassify, Categorized, Relation, Unclassified } from "@/lib/server/admin-queries";
import { AdminShell, when } from "../admin-shell";
import { AdminEmpty, AdminSection } from "../admin-ui";
import { AddRuleForm, AuditList, ClassifyNowForm, ConfirmRelationForm, RULE_KO, SetCategoryForm, ToggleRuleForm } from "./classify-forms";

export const TITLE = "분류 확인";
const LEAD = "지도 분류가 비어 있거나 사람이 확인해야 하는 것들이에요. 갈래 정하기, 같은 역할 확정, 규칙 고치기는 사유를 남겨야 해요.";
const PROVES = "지도 분류를 사람이 고치면 담당자 · 시각 · 사유가 남는다는 것";
const MADE_BY_KO: Record<string, string> = { seed: "처음 자료", rule: "규칙", ai: "Claude 제안", admin: "관리자" };
const TOOLBAR = { links: [{ href: "/admin/members", label: "회원과 권한" }, { href: "/admin/observations", label: "수집 자료" }] };

export type ClassifyData = Awaited<ReturnType<typeof readClassify>>;
export type ClassifyBodyProps = { data: ClassifyData | null; meId: string; error?: string | null; actionError?: string; info?: string };

export function ClassifyBody({ data, meId, error, actionError, info }: ClassifyBodyProps) {
  const groups = data ? categoryOptions(data.categories) : [];
  return (
    <AdminShell tab="classify" title={TITLE} lead={LEAD} proves={PROVES} error={error} toolbar={TOOLBAR}
      notes={[actionError ? { tone: "danger", text: actionError } : null, info ? { tone: "info", text: info } : null]}>
      {data ? (
        <>
          <AdminSection id="h-classify-now" title="규칙으로 한 번에 분류" desc="매일 실행 뒤에 도는 것과 같은 규칙이에요. 관리자가 정한 갈래는 바꾸지 않아요.">
            <ClassifyNowForm />
          </AdminSection>
          <Unclassifieds rows={data.unclassified} set={data.categorized} groups={groups} />
          {data.categorized === null ? null : <Categorizeds rows={data.categorized} groups={groups} />}
          <AdminSection id="h-manual" title={<>이름만 써서 직접 추가한 기술 <span className="muted">({data.manualNames.length})</span></>}>
            {data.manualNames.length === 0 ? <AdminEmpty>없어요.</AdminEmpty> : (
              <ul className="admin-list">{data.manualNames.map((m, i) => <li key={`${m.name}-${i}`}>{m.name} <span className="muted">· {when(m.createdAt)}</span></li>)}</ul>
            )}
          </AdminSection>
          <Relations rows={data.relations} />
          <Rules rows={data.rules} />
          <AuditList rows={data.audits} me={meId} />
        </>
      ) : null}
    </AdminShell>
  );
}

// 갈래 목록(categories)이 비면 고를 것이 없다: 처음 목록은 팀이 정한다(데이터설계 DQ2).
// 마이그레이션(P-18c) 전 DB면 갈래 칸이 없다: 갈래 정하기만 끄고 나머지는 그대로 보인다(readClassify가 null로 알림).
const NotReady = () => (
  <p className="admin-placeholder">
    <button type="button" disabled>갈래 정하기</button> 갈래 정하기는 DB 준비 중이에요(마이그레이션 적용 대기). 다른 분류 칸은 그대로 쓸 수 있어요.
  </p>
);

const NoCategories = () => (
  <p className="admin-placeholder">작은 갈래가 아직 없어 고를 수 없어요. 갈래의 처음 목록은 팀이 정해요(데이터설계 DQ2).</p>
);

function Unclassifieds({ rows, set, groups: allGroups }: { rows: Unclassified[]; set: Categorized[] | null; groups: CategoryGroup[] }) {
  const ready = set !== null;
  const groups = ready ? allGroups : []; // 준비 전에는 고르기 칸을 그리지 않는다
  return (
    <AdminSection id="h-unclassified" title={<>갈래가 없는 기술 <span className="muted">({rows.length})</span></>}>
      {!ready ? <NotReady /> : allGroups.length === 0 ? <NoCategories /> : null}
      {rows.length === 0 ? <AdminEmpty>갈래가 비어 있는 기술이 없어요.</AdminEmpty> : (
        <ul className="admin-list">
          {rows.map((t) => (
            <li key={t.id}>
              {t.name} <span className="muted">· {t.type} · {t.techKey}</span>
              {groups.length > 0 ? <SetCategoryForm techId={t.id} groups={groups} /> : null}
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}

function Categorizeds({ rows, groups }: { rows: Categorized[]; groups: CategoryGroup[] }) {
  return (
    <AdminSection id="h-categorized" title={<>관리자가 정한 갈래 <span className="muted">({rows.length})</span></>}>
      {rows.length === 0 ? <AdminEmpty>아직 없어요.</AdminEmpty> : (
        <ul className="admin-list">
          {rows.map((t) => (
            <li key={t.id}>
              {t.name} <span className="muted">· {t.categoryName} · {when(t.setAt)}</span>
              {groups.length > 0 ? <SetCategoryForm techId={t.id} groups={groups} current={t.categoryId} /> : null}
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}

function Relations({ rows }: { rows: Relation[] }) {
  const candidates = rows.filter((r) => r.status === "candidate");
  return (
    <AdminSection id="h-relations" title={<>같은 역할 후보 <span className="muted">(확인 전 {candidates.length} · 전체 {rows.length})</span></>}
      desc="확정한 관계만 적용 기회 알림에 쓰여요(ADR 0015). 확정은 되돌릴 수 없으니 근거를 확인한 뒤 눌러 주세요.">
      {rows.length === 0 ? <AdminEmpty>아직 후보가 없어요.</AdminEmpty> : (
        <div className="admin-table-wrap">
          <table>
            <thead><tr><th>기술 A</th><th>기술 B</th><th>상태</th><th>누가 냈나</th><th>근거 인용</th><th>확정</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.a}</td><td>{r.b}</td>
                  <td>{r.status === "confirmed" ? <span className="badge success">확정</span> : <span className="badge warning">후보</span>}</td>
                  <td>{MADE_BY_KO[r.madeBy] ?? r.madeBy}</td><td>{r.quote ?? "—"}</td>
                  <td>{r.status === "candidate" ? <ConfirmRelationForm id={r.id} /> : <span className="muted">{when(r.confirmedAt)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminSection>
  );
}

function Rules({ rows }: { rows: RuleRow[] }) {
  return (
    <AdminSection id="h-rules" title="규칙 목록">
      {groupRules(rows).map((g) => (
        <details key={g.kind} className="admin-details">
          <summary>{RULE_KO[g.kind] ?? g.kind} <span className="muted">&nbsp;· 켜짐 {g.on} · 꺼짐 {g.off}</span></summary>
          {g.rows.length === 0 ? <AdminEmpty>비어 있어요.</AdminEmpty> : (
            <ul className="admin-list">
              {g.rows.map((r) => (
                <li key={r.id}>
                  <span className="mono">{r.value}</span>
                  {r.ecosystem ? <span className="muted"> · {r.ecosystem}</span> : null}
                  {r.pattern_grade ? <> <span className={`badge ${r.pattern_grade === "danger" ? "danger" : "warning"}`}>{r.pattern_grade === "danger" ? "위험" : "주의"}</span></> : null}
                  {r.enabled ? null : <> <span className="badge neutral">꺼짐</span></>}
                  <ToggleRuleForm id={r.id} enabled={r.enabled} />
                </li>
              ))}
            </ul>
          )}
        </details>
      ))}
      <AddRuleForm />
    </AdminSection>
  );
}
