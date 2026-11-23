"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import type { Ctx } from "@/lib/server/my-tech";
import { archiveProject, editProject, restoreProject, type ProjectResult } from "@/lib/server/project-edit";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { backPath } from "@/lib/domain/my-tech-view";

// 프로젝트 이름·메모 고치기, 보관, 되살리기(PRD-F4, IA-2). 판단은 lib/server/project-edit.ts가 하고, 여기는 로그인 확인과 돌아가기만 한다.
// 주소에는 코드만 싣는다(문구는 화면이 PROJECT_ERROR_TEXT·PROJECT_NOTICE_TEXT에서 꺼냄).

async function context(): Promise<Ctx> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { db: (await getServerSupabase())!, audit: getServiceSupabase(), userId: user.id };
}

/** 실패면 이유 코드를, 성공이면 안내를 싣고 돌아간다. 이미 그 상태였으면(바뀐 것 없음) 그렇게 알린다. */
// base = 돌아갈 곳: 이름 · 메모 고치기는 그 레포 상세(폼의 from), 보관 · 되살리기는 보드(보관한 레포는 상세가 없음, P-12k K2)
function finish(result: ProjectResult, notice: string, base = "/dashboard"): never {
  revalidatePath("/dashboard");
  if (base !== "/dashboard") revalidatePath(base);
  if (!result.ok) redirect(`${base}?error=project_${result.code}`);
  redirect(`${base}?notice=${result.changed ? notice : "project_same"}${result.auditFailed ? "&audit=0" : ""}`);
}

const idOf = (formData: FormData) => String(formData.get("id") ?? "");

export async function editProjectAction(formData: FormData): Promise<void> {
  if (await isLoginPreview()) return; // 미리보기(개발용)는 저장하지 않는다
  const ctx = await context();
  finish(await editProject(ctx, idOf(formData), { name: String(formData.get("name") ?? ""), memo: String(formData.get("memo") ?? "") }), "project_edited", backPath(formData.get("from")));
}

export async function archiveProjectAction(formData: FormData): Promise<void> {
  if (await isLoginPreview()) return;
  const ctx = await context();
  finish(await archiveProject(ctx, idOf(formData)), "project_archived");
}

export async function restoreProjectAction(formData: FormData): Promise<void> {
  if (await isLoginPreview()) return;
  const ctx = await context();
  finish(await restoreProject(ctx, idOf(formData)), "project_restored");
}
