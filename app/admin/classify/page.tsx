// 분류 확인(IA-17, PRD-F24·F27, ADR 0015): 갈래가 없는 기술, 이름만 써서 직접 추가한 기술, 같은 역할 후보, 규칙 목록(rule_lists).
// 같은 역할 확정·규칙 켜기·끄기·추가는 사유를 받아 담당자·시각·사유를 남긴다(P-18b, audit_logs). 갈래 확정은 DB 권한이 없어 아직 자리만. 관리자만.
import { groupRules, type RuleRow } from "@/lib/admin/admin-summaries";
import { readClassify, type Relation, type Unclassified } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { AdminShell, when } from "../admin-shell";
import { AddRuleForm, AuditList, ConfirmRelationForm, RULE_KO, ToggleRuleForm } from "./classify-forms";

const TITLE = "분류 확인";
const LEAD = "지도 분류가 비어 있거나 사람이 확인해야 하는 것들이에요. 같은 역할 확정과 규칙 고치기는 사유를 남겨야 해요.";
const MADE_BY_KO: Record<string, string> = { seed: "처음 자료", rule: "규칙", ai: "Claude 제안", admin: "관리자" };

type Data = Awaited<ReturnType<typeof readClassify>>;
type Search = { error?: string; info?: string };

export default async function ClassifyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="classify" title={TITLE} blocked={gate.blocked} />;
  const { error: actionError, info } = await searchParams;
  let data: Data | null = null;
  let error: string | null = null;
  try { data = await readClassify(gate.db); } catch (e) { error = e instanceof Error ? e.message : String(e); }

  return (
    <AdminShell tab="classify" title={TITLE} lead={LEAD} error={error}>
      {actionError ? <p role="alert" className="admin-note danger">{actionError}</p> : null}
      {info ? <p role="status" className="admin-note">{info}</p> : null}
      {data ? (
        <>
          <Unclassifieds rows={data.unclassified} manual={data.manualNames} />
          <Relations rows={data.relations} />
          <Rules rows={data.rules} />
          <AuditList rows={data.audits} me={gate.user.id} />
        </>
      ) : null}
    </AdminShell>
  );
}

const Later = ({ what }: { what: string }) => (
  <p className="admin-placeholder">
    <button type="button" disabled>{what}</button> 기술 표(technologies)를 관리자가 고칠 DB 권한이 아직 없어 다음 조각에서 켜져요.
  </p>
);

function Unclassifieds({ rows, manual }: { rows: Unclassified[]; manual: Data["manualNames"] }) {
  return (
    <section aria-labelledby="h-unclassified">
      <h2 id="h-unclassified">갈래가 없는 기술 <span className="muted">({rows.length})</span></h2>
      {rows.length === 0 ? <p>갈래가 비어 있는 기술이 없어요.</p> : (
        <ul>{rows.map((t) => <li key={t.id}>{t.name} <span className="muted">· {t.type} · {t.techKey}</span></li>)}</ul>
      )}
      <h2>이름만 써서 직접 추가한 기술 <span className="muted">({manual.length})</span></h2>
      {manual.length === 0 ? <p>없어요.</p> : (
        <ul>{manual.map((m, i) => <li key={`${m.name}-${i}`}>{m.name} <span className="muted">· {when(m.createdAt)}</span></li>)}</ul>
      )}
      <Later what="갈래 확정·고치기" />
    </section>
  );
}

function Relations({ rows }: { rows: Relation[] }) {
  const candidates = rows.filter((r) => r.status === "candidate");
  return (
    <section aria-labelledby="h-relations">
      <h2 id="h-relations">같은 역할 후보 <span className="muted">(확인 전 {candidates.length} · 전체 {rows.length})</span></h2>
      {rows.length === 0 ? <p>아직 후보가 없어요.</p> : (
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
      <p className="muted">확정한 관계만 적용 기회 알림에 쓰여요(ADR 0015). 확정은 되돌릴 수 없으니 근거를 확인한 뒤 눌러 주세요.</p>
    </section>
  );
}

function Rules({ rows }: { rows: RuleRow[] }) {
  return (
    <section aria-labelledby="h-rules">
      <h2 id="h-rules">규칙 목록</h2>
      {groupRules(rows).map((g) => (
        <details key={g.kind}>
          <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>
            {RULE_KO[g.kind] ?? g.kind} <span className="muted">&nbsp;· 켜짐 {g.on} · 꺼짐 {g.off}</span>
          </summary>
          {g.rows.length === 0 ? <p className="muted">비어 있어요.</p> : (
            <ul>
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
    </section>
  );
}
