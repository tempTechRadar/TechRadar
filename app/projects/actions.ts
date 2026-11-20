"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/server/current-user";
import { registerAndRead } from "@/lib/server/first-read";
import { RepoNotPublicError } from "@/lib/server/collect-fetch";
import { parseGithubRepo } from "@/lib/domain/manifest";
import { isArchivedRepo } from "@/lib/server/project-edit";
import { getServerSupabase } from "@/lib/supabase/server";

/** 프로젝트 등록 = 처음 읽기. 이미 등록한 주소면 다시 읽기(IA-2, PRD-F4·F6). */
export async function registerProject(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const repo = parseGithubRepo(String(formData.get("repoUrl") ?? ""));
  if (!repo) redirect("/projects?error=url");
  // 보관한 프로젝트의 주소면 보관된 채로 다시 읽기만 돌아 화면에 아무것도 안 보이는 일이 없게 먼저 막는다. 조회가 실패하면 모르는 채로 읽지 않는다
  const archived = await isArchivedRepo((await getServerSupabase())!, user.id, repo.url).then((v) => ({ v }), (e) => (console.error("보관 여부 조회 실패", e instanceof Error ? e.message : e), null));
  if (archived === null) redirect("/projects?error=project_failed");
  if (archived.v) redirect("/projects?error=archived");
  try {
    await registerAndRead(user, repo);
  } catch (e) {
    // 새 등록에서 GitHub가 저장소를 열 수 없다고 답하면 등록하지 않고 이유를 보여 준다
    if (e instanceof RepoNotPublicError) redirect("/projects?error=repo");
    throw e;
  }
  revalidatePath("/projects");
  redirect("/projects");
}
