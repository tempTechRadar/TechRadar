import { Cell } from "../alerts/[id]/opportunity-cards";
import { buildComparisonTable } from "@/lib/alerts/build-comparison";
import { cellOf } from "@/lib/alerts/to-alert-view";
import type { ComparableTech } from "@/lib/alerts/build-comparison";

// 비교 모드의 결과 표(PRD-F42). 적용 기회 비교표와 같은 5항목·출처 규칙. 와이어프레임 docs/wireframes/extras.html#compare-result.
export function CompareTable({ techs }: { techs: { id: string; name: string; tech: ComparableTech }[] }) {
  const rows = buildComparisonTable(techs.map((t) => t.tech));
  return (
    <article className="card" aria-labelledby="table-title">
      <h2 id="table-title">비교</h2>
      <p className="muted">지금 값이에요. 항목마다 출처를 붙였어요.</p>
      <table className="compare">
        <thead>
          <tr>
            <th scope="col">항목</th>
            {techs.map((t) => <th key={t.id} scope="col">{t.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.item}>
              <th scope="row">{row.item}</th>
              {row.cells.map((cell, index) => <Cell key={techs[index].id} label={techs[index].name} cell={cellOf(cell)} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
