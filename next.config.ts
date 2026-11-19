import type { NextConfig } from "next";

// 운영 모드(next start·배포)에서만 보안 응답 헤더를 붙인다. 개발 서버(next dev)는 내장 미리보기가 화면을 열 수 있어야 해서 뺀다.
// 요구: PRD-NF8, 시험: lib/security-headers.test.ts
// X-Frame-Options와 CSP frame-ancestors는 같은 뜻이다(앞의 것은 CSP를 모르는 옛 브라우저용). 다른 사이트에 끼워 넣을 일이 생기면 둘 다 고친다.
// Permissions-Policy: 이 앱은 카메라·마이크·위치를 쓰지 않으니 끄는 것이 기본이다. 쓰는 기능이 생기면 그 항목만 푼다.
// shortcut: CSP는 frame-ancestors만 둔다. 스크립트를 막는 규칙(script-src)은 Next의 인라인 스크립트와 부딪혀 nonce 설정이 필요하다. 필요해지면 그때 따로 정한다.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return process.env.NODE_ENV === "production" ? [{ source: "/:path*", headers: SECURITY_HEADERS }] : [];
  },
};

export default nextConfig;
