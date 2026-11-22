"use client";
// 루트 레이아웃(메뉴 · 탭 바)까지 깨졌을 때(I-P-12d-ui-sweep): app/error.tsx는 레이아웃을 감싸지 않아 Next 기본 영어 화면이 나오던 자리.
// 레이아웃 대신 그려서 html · body · 공용 토큰을 직접 둔다. 안의 글은 error.tsx와 같다(원문 없음, 불변 2)
import ErrorPage from "./error";
import "./tokens.css";
import "./page.css"; // 루트 레이아웃이 깨졌을 때도 같은 틀(레이아웃 대신 이 파일이 html을 그림)

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ko">
      <body>
        <title>화면을 열지 못했어요 · TechRadar</title>
        <ErrorPage error={error} retry={retry} />
      </body>
    </html>
  );
}
