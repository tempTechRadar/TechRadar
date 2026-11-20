// 보기 화면 조각(PRD-F34·F37): 갤러리, 소식판·쓰고 있어요 자리(내 레이더 칸반은 kanban.tsx). 값은 lib/views 순수 함수가 만든다.
import type { Card } from "@/lib/views/gallery";

const GRADE_LOOK: Record<string, { bg: string; border: string }> = {
  위험: { bg: "#f7c6c1", border: "#d6453b" },
  주의: { bg: "#fff1d6", border: "#e08a00" },
  통과: { bg: "#bfe8cf", border: "#2e9a5f" },
  "찾지 못함": { bg: "#eceae4", border: "#b9b4a8" },
};

export function Gallery({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return <p>아직 내 기술이 없어요. 프로젝트를 등록하면 카드가 생겨요.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
      {cards.map((c) => {
        const look = GRADE_LOOK[c.gradeKo];
        return (
          <li key={c.id} style={{ border: `2px solid ${look.border}`, borderRadius: 12, padding: 12, background: "#fff" }}>
            <span style={{ display: "inline-block", background: look.bg, borderRadius: 999, padding: "2px 10px", fontSize: 13, fontWeight: 700 }}>{c.gradeKo}</span>
            <h3 style={{ margin: "8px 0 4px", fontSize: 16, wordBreak: "break-all" }}>{c.name}{c.version ? `@${c.version}` : ""}</h3>
            <p style={{ margin: 0, fontSize: 13, color: "#5b564c" }}>{c.projectName}</p>
            {c.note ? <p style={{ margin: "6px 0 0", fontSize: 14 }}>{c.note}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function NewsPlaceholder() {
  return (
    <section aria-label="소식판" style={{ border: "1px dashed #b9b4a8", borderRadius: 12, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>소식판 (준비 중)</h3>
      <p>공식 출처의 일반 소식(도구 새 버전, 모델 출시, 공식 보안 공지)을 최근 30일만 모아 보여 줄 자리예요. 알림이 아니고 판단 대기 수에 들어가지 않아요.</p>
      <p style={{ color: "#5b564c", fontSize: 14 }}>소식을 모으는 수집(P-9)이 합쳐지면 채워져요. 그전에는 비어 있어요(가짜 소식을 넣지 않아요).</p>
    </section>
  );
}

export function UsingNowPlaceholder() {
  return (
    <section aria-label="쓰고 있어요" style={{ border: "1px dashed #b9b4a8", borderRadius: 12, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>쓰고 있어요 (준비 중)</h3>
      <p>그 기술을 쓰는 사람 수와 별명만 보여 줄 자리예요. 구글 이름·이메일은 보이지 않고, 설정에서 숨김을 켠 사람은 이름과 수 모두에서 빠져요.</p>
      <p style={{ color: "#5b564c", fontSize: 14 }}>지금 데이터 규칙으로는 다른 사람의 목록을 셀 수 없어서(본인 것만 읽힘) 비어 있어요. 수와 별명만 돌려주는 DB 함수가 생기면 채워져요.</p>
    </section>
  );
}
