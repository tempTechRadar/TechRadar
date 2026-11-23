// 개발 컴퓨터(next dev)에서만 열리는 관리자 화면 견본: /dev/admin-sample/<화면>. 가짜 자료로 각 본문(body.tsx)을 그려 배치를 눈으로 맞춘다(I-admin-unify).
// 실제 기록이 아니다. 배포(운영·미리보기)에서는 404(/dev/admin-sample과 같은 가드). 로그인 없이 열리고, 단추 · 링크는 눌러도 로그인 화면으로 간다.
import { notFound } from "next/navigation";
import { VIEWS } from "./samples";

export default async function AdminViewSample({ params }: { params: Promise<{ view: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view } = await params;
  const render = VIEWS[view];
  if (!render) notFound();
  return (
    <>
      <p role="note" style={{ margin: "0 auto 8px", maxWidth: 1280, padding: "6px 12px", borderRadius: 8, background: "var(--bg-caution)", color: "var(--ink-caution)", fontSize: 13 }}>
        가짜 값 견본: 실제 기록이 아니에요. 화면 배치를 눈으로 맞추려고 지어낸 값이고 DB를 읽지 않아요.
      </p>
      {render()}
    </>
  );
}
