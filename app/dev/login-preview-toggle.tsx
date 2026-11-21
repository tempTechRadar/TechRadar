"use client";
// 로그인 화면 미리보기(개발용) 체크표시: 레이아웃이 next dev에서만 그린다(lib/dev/login-preview.ts). 켜면 쿠키 + 새로 그리기, 끄면 쿠키를 지운다.
import { useRouter } from "next/navigation";
import { LOGIN_PREVIEW_COOKIE } from "@/lib/dev/login-preview";

export function LoginPreviewToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const toggle = (next: boolean) => {
    document.cookie = `${LOGIN_PREVIEW_COOKIE}=${next ? "1; max-age=86400" : "; max-age=0"}; path=/; samesite=lax`;
    router.refresh();
  };
  return (
    <label style={{ position: "fixed", right: 12, bottom: 72, zIndex: 50, display: "flex", gap: 6, alignItems: "center", padding: "6px 10px",
      font: "12px/1.2 system-ui, sans-serif", background: "var(--surface)", color: "var(--ink)", border: "1px dashed currentColor", borderRadius: 8, opacity: 0.85 }}>
      <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
      로그인 화면 미리보기(개발용)
    </label>
  );
}
