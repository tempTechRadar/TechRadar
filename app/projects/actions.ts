"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/server/current-user";
import { registerAndRead } from "@/lib/server/first-read";
import { RepoNotPublicError } from "@/lib/server/collect-fetch";
import { parseGithubRepo } from "@/lib/domain/manifest";
import { checkProjectEdit, isProjectId } from "@/lib/domain/project-edit";
import { getServerSupabase } from "@/lib/supabase/server";

/** 프로젝트 등록 = 처음 읽기. 이미 등록한 주소면 다시 읽기(IA-2, PRD-F4·F6). */
export async function registerProject(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const repo = parseGithubRepo(String(formData.get("repoUrl") ?? ""));
  if (!repo) redirect("/projects?error=url");
  try {
    await registerAndRead(user, repo);
  } catch (e) {
    // 새 등록에서 GitHub가 저장소를 열 수 없다고 답하면 등록하지 않고 이유를 보여 준다
    if (e instanceof RepoNotPublicError) redirect("/projects?error=repo");
    throw e;
  }
  // 보관한 프로젝트의 주소를 다시 등록하면 되살린다(읽기는 됐는데 목록에서 안 보이면 "없음"처럼 보인다). 본인 것만(RLS + owner_id)
  const db = await getServerSupabase();
  if (db) {
    const r = await db.from("projects").update({ archived_at: null }).eq("owner_id", user.id).eq("repo_url", repo.url).not("archived_at", "is", null);
    // 읽기는 됐어도 되살리지 못하면 목록에 안 보이니 이유를 보인다(불변 4)
    if (r.error) { console.error("보관한 프로젝트를 되살리지 못함", r.error.message); redirect("/projects?error=project-save"); }
  }
  revalidatePath("/projects");
  redirect("/projects");
}

/** 바뀐 프로젝트가 보이는 화면들(목록 · 지도 · 내 레이더 숫자) */
function refreshProjectScreens() { for (const path of ["/projects", "/", "/views", "/dashboard"]) revalidatePath(path); }

/** 프로젝트 이름 · 메모 고치기(PRD-F4 3순위). 사용자 토큰으로 본인 줄만(RLS projects_update). 실패하면 그대로 두고 이유를 보인다 */
export async function editProject(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const checked = checkProjectEdit({ id: formData.get("projectId"), name: formData.get("name"), memo: formData.get("memo") });
  if (!checked.ok) redirect(`/projects?error=${checked.error}`);
  const db = await getServerSupabase();
  if (!db) redirect("/projects?error=project-save");
  const { id, name, memo } = checked.value;
  const r = await db.from("projects").update({ name, memo }).eq("id", id).eq("owner_id", user.id).select("id");
  if (r.error || !r.data?.length) { if (r.error) console.error("프로젝트를 고치지 못함", r.error.message); redirect(`/projects?error=${r.error ? "project-save" : "project-id"}`); }
  refreshProjectScreens();
  redirect("/projects?notice=project-saved");
}

/** 보관 · 되살리기(PRD-F4 3순위, ADR 0020). 지우지 않는다: 내 기술 · 알림 · 판단 기록은 그대로. 목록 · 지도 · 숫자에서 빠지고 정기 점검 · 새 알림도 멈춘다 */
export async function setProjectArchived(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = formData.get("projectId");
  if (!isProjectId(id)) redirect("/projects?error=project-id");
  const archive = formData.get("archive") === "1";
  const db = await getServerSupabase();
  if (!db) redirect("/projects?error=project-save");
  const r = await db.from("projects").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", id).eq("owner_id", user.id).select("id");
  if (r.error || !r.data?.length) { if (r.error) console.error("프로젝트를 보관하지 못함", r.error.message); redirect(`/projects?error=${r.error ? "project-save" : "project-id"}`); }
  refreshProjectScreens();
  redirect(`/projects?notice=${archive ? "project-archived" : "project-unarchived"}`);
}
