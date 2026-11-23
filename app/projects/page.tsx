import { redirect } from "next/navigation";

// 옛 "내 프로젝트" 목록(IA-2 · 3)은 프로젝트 관리 보드의 "레포 관리 · 내 기술" 위젯으로 흡수됐다(P-12i D3).
// 북마크 · 옛 링크가 끊기지 않게 같은 주소 값(거르기 · 검색 · 결과 코드)을 싣고 /dashboard로 보낸다. /projects/install · runs · tech/[id]는 그대로.
type Query = Record<string, string | string[] | undefined>;
const KEEP = ["error", "notice", "audit", "grade", "project", "hidden", "q"];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams, next = new URLSearchParams();
  for (const k of KEEP) { const v = query[k]; if (typeof v === "string" && v) next.set(k, v); }
  redirect(`/dashboard${next.size ? `?${next}` : ""}#w-manage`);
}
