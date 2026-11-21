import { isTestLoginEnabled } from "@/lib/env";
import GoogleLoginButton from "./google-login-button";
import TestLoginForm from "./test-login-form";

const ERROR_TEXT: Record<string, string> = {
  google: "구글 로그인을 마치지 못했어요. 다시 시도해 주세요.",
  config: "서버의 Supabase 설정이 비어 있어요. 관리자에게 알려 주세요.",
  logout: "로그아웃하지 못했어요. 아직 로그인된 상태예요. 잠시 뒤 다시 눌러 주세요.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const testLogin = isTestLoginEnabled(process.env);
  return (
    <main className="page">
      <h1>로그인</h1>
      {/* design.md 18절 로그인(IA-1): 서비스 한 줄 설명과 개인정보 안내 */}
      <p>내 프로젝트에 깐 AI 코딩 도구를 지키고, 고르고, 옮겨요. 위험·새 버전·대안을 한 지도에서 보고, 내가 승인한 것만 바꿔요.</p>
      {error && <p role="alert" className="notice notice-error">{ERROR_TEXT[error] ?? ERROR_TEXT.google}</p>}
      <GoogleLoginButton next={next} />
      <ul className="muted">
        <li>이메일은 로그인에만 써요.</li>
        <li>비밀번호·토큰은 받지 않아요.</li>
        <li>내 판단·기록은 나만 봐요. 다른 사람에게는 설정에서 켠 별명과 &apos;쓰고 있어요&apos; 수만 보여요.</li>
      </ul>
      {testLogin ? <TestLoginForm /> : null}
    </main>
  );
}
