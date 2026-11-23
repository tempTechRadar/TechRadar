import type { KoOverview } from "@/lib/views/ko-overview";

// 한국어 개요 + "AI 번역" + [원문 보기](P-12r). 훅이 없어 서버 · 클라이언트 화면이 같이 쓴다. <details>는 <p> 안에 못 들어가 <div>로 감싼다
export function KoOverviewText({ v }: { v: KoOverview }) {
  return (
    <div className="ko-overview">
      <p>{v.ko} <span className="tag">AI 번역</span></p>
      {v.original || v.source ? (
        <details>
          <summary>원문 보기</summary>
          {v.original ? <p lang="en">{v.original}</p> : null}
          {v.source ? <a href={v.source} target="_blank" rel="noopener noreferrer">출처 열기</a> : null}
        </details>
      ) : null}
    </div>
  );
}
