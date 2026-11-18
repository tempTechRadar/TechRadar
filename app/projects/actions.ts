"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/server/current-user";
import { registerAndRead } from "@/lib/server/first-read";
import { parseGithubRepo } from "@/lib/domain/manifest";

/** 프로젝트 등록 = 처음 읽기. 이미 등록한 주소면 다시 읽기(IA-2, PRD-F4·F6). */
export async function registerProject(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const repo = parseGithubRepo(String(formData.get("repoUrl") ?? ""));
  if (!repo) redirect("/projects?error=url");
  await registerAndRead(user, repo);
  revalidatePath("/projects");
  redirect("/projects");
}
