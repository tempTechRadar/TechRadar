import { describeSimilarJudgment } from "@/lib/alerts/describe-similar-judgment";
import type { SimilarJudgment } from "@/lib/alerts/find-similar-judgments";

// "비슷한 지난 판단" 카드(IA-7, PRD-F21). null은 읽기 실패: "찾지 못함"과 다르게 알린다.
export function SimilarCard({ similar }: { similar: SimilarJudgment[] | null }) {
  return (
    <article className="card" aria-labelledby="similar-title">
      <h2 id="similar-title">비슷한 지난 판단</h2>
      {similar === null ? (
        <div className="notice notice-error" role="alert"><strong>지난 판단을 불러오지 못했어요.</strong> 지난 판단이 없는 게 아니에요. 잠시 뒤에 새로 고쳐 주세요.</div>
      ) : similar.length === 0 ? (
        <p className="muted">찾지 못함</p>
      ) : (
        <ul className="alert-list">
          {similar.map((judgment) => {
            const { title, detail, meta } = describeSimilarJudgment(judgment);
            return (
              <li key={judgment.alertId} className="alert-row" style={{ gridTemplateColumns: "1fr" }}>
                <span className="alert-main"><strong>{title}</strong><span>{detail}</span><span className="muted">{meta}</span></span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
