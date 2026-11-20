import { DRAFT_MISSING_TEXT } from "@/lib/alerts/draft-missing-text";
import type { AlertView } from "@/lib/alerts/to-alert-view";

// 보안 경고 상세의 "대응안 초안" 카드(IA-7, PRD-F15, 와이어프레임 docs/wireframes/alerts.html#detail).
// 초안은 Claude가 만든 참고 글이라 표시를 붙이고, 출처가 없으면 "출처 찾지 못함"으로 둔다. 만들지 못했어도 알림은 있다(flow.md).
export function DraftCard({ card }: { card: NonNullable<AlertView["draftCard"]> }) {
  return (
    <article className="card" aria-labelledby="draft-title">
      <h2 id="draft-title">대응안 초안 <span className="badge badge-neutral">Claude가 만든 초안</span></h2>
      {card.state === "missing" ? (
        <p className="muted">{DRAFT_MISSING_TEXT}</p>
      ) : (
        <>
          <p className="draft-text">{card.text}</p>
          <p className="muted">
            출처:{" "}
            {card.sources.length === 0
              ? "출처 찾지 못함"
              : card.sources.map((source, index) => (
                  <span key={source}>
                    {index > 0 && ", "}
                    <a href={source} target="_blank" rel="noopener noreferrer">{source}</a>
                  </span>
                ))}
          </p>
        </>
      )}
    </article>
  );
}
