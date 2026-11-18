import { isTestLoginEnabled } from "@/lib/env";
import TestLoginForm from "./test-login-form";

export default function LoginPage() {
  const testLogin = isTestLoginEnabled(process.env);
  return (
    <main>
      <h1>로그인</h1>
      <p>구글로 계속하기는 P-12에서 붙입니다.</p>
      {testLogin ? <TestLoginForm /> : <p>개발용 테스트 로그인은 이 환경에서 꺼져 있어요.</p>}
    </main>
  );
}
