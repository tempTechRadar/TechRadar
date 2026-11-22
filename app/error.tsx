"use client";
// 화면이 깨졌을 때(I-P-12d-ui-sweep): Next 기본 영어 화면 대신. 읽지 못한 것을 "없음"으로 말하지 않고(불변 2), 오류 원문은 보이지 않는다(운영은 Next가 숨기고, 개발도 여기서는 안 그린다)
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]); // 삼키지 않는다: 브라우저 콘솔 · 서버 기록(digest)으로 찾게
  return (
    <main className="page">
      <h1>화면을 열지 못했어요</h1>
      <div className="notice notice-error" role="alert"><strong>이 화면을 불러오지 못했어요.</strong> 내용이 없다는 뜻이 아니에요. 잠시 뒤 다시 시도해 주세요.</div>
      <p className="actions"><button type="button" className="btn btn-primary" onClick={() => retry()}>다시 시도</button><Link className="btn" href="/">기술 지도로 가기</Link></p>
    </main>
  );
}
