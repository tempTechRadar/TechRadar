// 로그인 화면 미리보기(개발용) 가짜 계정이 샘플 없는 화면을 열 때: DB를 부르지 않고 이 안내만(가짜 id로 읽으면 빈 화면이거나 설정 없는 컴퓨터에서 깨진다).
// 화면이 getServerSupabase()보다 먼저 이걸로 끝나는지는 lib/dev/login-preview-guard.test.ts가 본다. 막다른 길이 되지 않게 샘플 화면으로 가는 단추를 둔다
import Link from "next/link";
import "../alerts/alerts.css";

export function PreviewOnly({ title }: { title: string }) {
  return (
    <main className="alerts">
      <h1>{title}</h1>
      <p className="notice notice-empty" role="status">미리보기에서는 이 화면의 실제 기록을 읽지 않아요. 지도 · 알림 · 내 레이더에서 샘플을 볼 수 있어요.</p>
      <p className="actions"><Link className="btn btn-primary" href="/">기술 지도로 가기</Link><Link className="btn" href="/views">내 레이더</Link></p>
    </main>
  );
}
