import Link from "next/link";
import GoogleLoginButton from "./google-login-button";
import "../alerts/alerts.css";

// 로그인이 필요한 화면을 로그인 전에 눌렀을 때(11-21 사용자 결정: 메뉴는 로그인 전후 똑같이, 누르면 무엇이 열리는지 + 로그인).
// 로그인 화면으로 바로 보내지 않고 그 자리에서 알려 준다. 로그인하면 next(이 화면 + 주소 값)로 돌아온다. 시험 로그인 등 다른 방법은 로그인 화면에.
/** 화면 경로 + 주소 값(필터 · 탭)을 로그인 뒤 돌아올 곳으로 */
export const backTo = (path: string, params: Record<string, string | undefined>) => {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  return q ? `${path}?${q}` : path;
};
export function LoginNeeded({ title, why, next }: { title: string; why: string; next: string }) {
  return (
    <main className="alerts">
      <h1>{title}</h1>
      <section className="notice notice-empty" aria-label="로그인이 필요해요">
        <p><strong>{why}</strong></p>
        <p className="muted">로그인하면 이 화면으로 돌아와요. 이메일은 로그인에만 쓰고, 비밀번호 · 토큰은 받지 않아요.</p>
        <GoogleLoginButton next={next} />
        <p className="muted"><Link href={`/login?next=${encodeURIComponent(next)}`}>다른 방법으로 로그인</Link></p>
      </section>
    </main>
  );
}
