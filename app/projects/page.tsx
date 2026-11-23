import { redirect } from "next/navigation";
import { isUuid } from "@/lib/domain/my-tech-view";

// 옛 "내 프로젝트" 목록(IA-2 · 3) 주소. 목록은 보드 "진행 중 프로젝트" 판, 레포 하나는 레포 상세 /projects/[id](P-12k K2)가 맡는다.
// 북마크 · 옛 링크가 끊기지 않게: ?project=<레포 id>면 그 레포 상세로, 아니면 결과 코드(error · notice · audit)를 싣고 보드 진행 중 프로젝트 판으로. /projects/install · runs · tech/[id]는 그대로.
type Query = Record<string, string | string[] | undefined>;
const KEEP = ["error", "notice", "audit"];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams, next = new URLSearchParams();
  if (typeof query.project === "string" && isUuid(query.project)) redirect(`/projects/${query.project}`);
  for (const k of KEEP) { const v = query[k]; if (typeof v === "string" && v) next.set(k, v); }
  redirect(`/dashboard${next.size ? `?${next}` : ""}#w-repos`);
}
