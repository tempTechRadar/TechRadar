"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { backPath, keepView } from "@/lib/domain/my-tech-view";
import { maskSecrets } from "@/lib/domain/redact";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { resolveProjectId } from "@/lib/server/local-import";
import { addTech, setTechHidden, type Ctx } from "@/lib/server/my-tech";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { getServerSupabase } from "@/lib/supabase/server";

// 내 기술 목록 바꾸기(IA-3, PRD-F7). 판단은 lib/server/my-tech.ts가 하고, 여기는 로그인 확인과 돌아가기만 한다.
// 주소에는 코드만 싣는다(문구는 화면이 TECH_ERROR_TEXT에서 꺼냄).
type Outcome = { ok: true; auditFailed: boolean } | { ok: false; code: string };

async function context(): Promise<Ctx> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { db: (await getServerSupabase())!, audit: getServiceSupabase(), userId: user.id };
}

// 폼이 보내 온 보던 화면(back)은 keepView가 다시 검사해서 쓴다. 숨기기·추가 뒤에도 거르기와 검색이 그대로 남는다.
const viewOf = (formData: FormData) => keepView(Object.fromEntries(new URLSearchParams(String(formData.get("back") ?? ""))));

// base = 돌아갈 곳(폼의 from = 레포 id면 그 레포 상세, 아니면 보드, P-12k K2)
function finish(result: Outcome, notice: string, view: string, base: string): never {
  revalidatePath("/dashboard");
  if (base !== "/dashboard") revalidatePath(base);
  const tail = view ? `&${view}` : "";
  if (!result.ok) redirect(`${base}?error=${result.code}${tail}`);
  redirect(`${base}?notice=${notice}${result.auditFailed ? "&audit=0" : ""}${tail}`);
}

/** 직접 숨기기·되돌리기. 숨긴 기술은 다시 읽어도 되살아나지 않는다(first-read가 hidden_at을 덮어쓰지 않음). */
export async function toggleHidden(formData: FormData): Promise<void> {
  if (await isLoginPreview()) return; // 미리보기(개발용)는 저장하지 않는다
  const ctx = await context();
  const hide = formData.get("hide") === "1";
  finish(await setTechHidden(ctx, String(formData.get("id") ?? ""), hide), hide ? "hidden" : "restored", viewOf(formData), backPath(formData.get("from")));
}

/** "프로젝트 밖(내 컴퓨터)" 칸은 처음 쓸 때 만든다(import 저장과 같은 함수). */
async function resolveProject(ctx: Ctx, raw: string): Promise<string | null> {
  try {
    return await resolveProjectId(ctx.db, ctx.userId, raw);
  } catch (e) {
    console.error("프로젝트 밖 칸 준비 실패", maskSecrets(String(e)));
    return null;
  }
}

/** 직접 추가: 모은 기술에서 고르거나(techId), 이름만 쓴다(name). */
export async function addTechAction(formData: FormData): Promise<void> {
  if (await isLoginPreview()) return;
  const ctx = await context();
  const projectId = await resolveProject(ctx, String(formData.get("projectId") ?? ""));
  const view = viewOf(formData);
  if (projectId === null) finish({ ok: false, code: "failed" }, "", view, "/dashboard");
  const result = await addTech(ctx, {
    projectId,
    techId: String(formData.get("techId") ?? "") || null,
    name: String(formData.get("name") ?? ""),
    version: String(formData.get("version") ?? ""),
  });
  finish(result, "added", view, "/dashboard");
}
