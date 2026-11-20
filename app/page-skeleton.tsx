// 화면을 읽는 동안 보이는 뼈대(11-21 사용자 결정 "스켈레톤"): 제목은 바로, 줄은 회색 막대로. 3초가 넘으면 "아직 읽는 중"(CSS 지연, 스크립트 없음).
// redirect · notFound가 있는 경로(/alerts/[id] 등)에는 두지 않는다: 읽는 화면을 먼저 보내면 404 · 이동이 200으로 나간다
import "./alerts/alerts.css";
import "./page-skeleton.css";

export function PageSkeleton({ title, rows = 5 }: { title: string; rows?: number }) {
  return (
    <main className="alerts" aria-busy="true">
      <h1>{title}</h1>
      <p className="skel-slow" role="status">아직 읽는 중이에요. 조금만 기다려 주세요.</p>
      <div className="skel-list" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skel-row"><span /><span /></div>)}</div>
    </main>
  );
}
