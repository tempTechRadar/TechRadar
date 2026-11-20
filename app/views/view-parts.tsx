// 보기 화면 조각(PRD-F34·F37): 갤러리, 소식판·쓰고 있어요 자리(내 레이더 칸반은 kanban.tsx). 값은 lib/views 순수 함수가 만든다.
import { GRADE_TONE } from "@/lib/domain/my-tech-view";
import type { Card } from "@/lib/views/gallery";

// 색은 공용 토큰과 .alerts의 배지(design.md 16절): 화면마다 색을 따로 박지 않는다. 배지 색은 내 기술 표와 같은 대응표(GRADE_TONE)

export function Gallery({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return <p>아직 내 기술이 없어요. 프로젝트를 등록하면 카드가 생겨요.</p>;
  return (
    <ul className="gallery">
      {cards.map((c) => (
        <li key={c.id} className="kb-card" data-grade={c.concept ? "none" : c.grade}>
          <span className={`badge badge-${GRADE_TONE[c.grade]}`}>{c.gradeKo}</span>
          <h3>{c.name}{c.version ? `@${c.version}` : ""}</h3>
          <p className="muted">{c.projectName}</p>
          {c.note ? <p>{c.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function NewsPlaceholder() {
  return (
    <section aria-label="소식판" className="notice notice-empty">
      <h3>소식판 (준비 중)</h3>
      <p>공식 출처의 일반 소식(도구 새 버전, 모델 출시, 공식 보안 공지)을 최근 30일만 모아 보여 줄 자리예요. 알림이 아니고 판단 대기 수에 들어가지 않아요.</p>
      <p className="muted">소식을 모으는 수집(P-9)이 합쳐지면 채워져요. 그전에는 비어 있어요(가짜 소식을 넣지 않아요).</p>
    </section>
  );
}

export function UsingNowPlaceholder() {
  return (
    <section aria-label="쓰고 있어요" className="notice notice-empty">
      <h3>쓰고 있어요 (준비 중)</h3>
      <p>그 기술을 쓰는 사람 수와 별명만 보여 줄 자리예요. 구글 이름·이메일은 보이지 않고, 설정에서 숨김을 켠 사람은 이름과 수 모두에서 빠져요.</p>
      <p className="muted">지금 데이터 규칙으로는 다른 사람의 목록을 셀 수 없어서(본인 것만 읽힘) 비어 있어요. 수와 별명만 돌려주는 DB 함수가 생기면 채워져요.</p>
    </section>
  );
}
