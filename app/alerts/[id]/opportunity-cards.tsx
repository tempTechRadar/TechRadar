import type { CellView, ComparisonView } from "@/lib/alerts/to-alert-view";

// 적용 기회 알림 상세의 카드 둘(IA-7, SPEC-5.3, 와이어프레임 docs/wireframes/alerts.html#opportunity).

export function ReasonCard({ line }: { line: string }) {
  return (
    <article className="card" aria-labelledby="why-title">
      <h2 id="why-title">나오게 된 이유</h2>
      <p>{line}</p>
    </article>
  );
}

export function ComparisonCard({ comparison }: { comparison: ComparisonView }) {
  return (
    <article className="card" aria-labelledby="compare-title">
      <h2 id="compare-title">비교</h2>
      <p className="muted">알림이 만들어진 때의 값이에요. 항목마다 출처를 붙였어요.</p>
      <table className="compare">
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col">{comparison.headers.mine}</th>
            <th scope="col">{comparison.headers.theirs}</th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.item}>
              <th scope="row">{row.item}</th>
              <Cell label="내 기술" cell={row.mine} />
              <Cell label="새 기술" cell={row.theirs} />
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

// 값을 못 찾은 칸("찾지 못함")에는 출처 줄을 달지 않는다. 값이 있는데 출처가 없으면 "출처 찾지 못함".
function Cell({ label, cell }: { label: string; cell: CellView }) {
  const found = cell.value !== "찾지 못함";
  return (
    <td data-label={label}>
      {cell.value}
      {found && <Source cell={cell} />}
    </td>
  );
}

function Source({ cell }: { cell: CellView }) {
  if (cell.source === null) return <span className="source muted">출처 찾지 못함</span>;
  if (cell.sourceIsLink) return <a className="source" href={cell.source} target="_blank" rel="noopener noreferrer">출처</a>;
  return <span className="source muted">출처: {cell.source}</span>;
}
