import { isTestLoginEnabled } from "@/lib/env";
import GoogleLoginButton from "./google-login-button";
import TestLoginForm from "./test-login-form";

const ERROR_TEXT: Record<string, string> = {
  google: "구글 로그인을 마치지 못했어요. 다시 시도해 주세요.",
  config: "서버의 Supabase 설정이 비어 있어요. 관리자에게 알려 주세요.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const testLogin = isTestLoginEnabled(process.env);
  return (
    <main>
      <h1>로그인</h1>
      {error && <p role="alert">{ERROR_TEXT[error] ?? ERROR_TEXT.google}</p>}
      <GoogleLoginButton next={next} />
      {testLogin ? <TestLoginForm /> : null}
    </main>
  );
}
