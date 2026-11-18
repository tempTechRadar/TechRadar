// 관리자 화면에 들어올 수 있는가(PRD-F3, 불변 5). 화면·서버가 이 규칙을 쓰고, DB는 RLS가 따로 막는다. 순수 함수.
export type AdminAccess = "ok" | "login" | "forbidden";

export function adminAccess(user: { role: string } | null): AdminAccess {
  if (user === null) return "login";
  return user.role === "admin" ? "ok" : "forbidden";
}
