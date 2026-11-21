import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import { isTempNickname } from "@/lib/domain/nickname";
import { PreviewOnly } from "@/app/dev/preview-only";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

// 설정(IA-19, PRD-F34·F1): 별명과 "쓰고 있어요"에 내 별명 보이기(기본 켜짐). 가입 직후(임시 별명)에는 별명을 먼저 정하게 한다(IA-1).
type Params = { welcome?: string; next?: string };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  if (isPreviewUser(user)) return <PreviewOnly title="설정" />; // 미리보기(개발용)는 DB를 부르지 않는다
  const params = await searchParams;
  const supabase = (await getServerSupabase())!;
  const { data, error } = await supabase.from("profiles").select("is_public").eq("id", user.id).single();
  if (error || !data) console.error("설정을 읽지 못함", error?.message);
  const welcome = isTempNickname(user.nickname, user.id); // 임시 별명일 때만(주소의 welcome 값은 믿지 않는다)

  return (
    <main className="page">
      <h1>설정</h1>
      {welcome ? (
        <div className="notice notice-empty">
          <strong>가입을 마치려면 별명을 정해 주세요.</strong> 아래 &apos;쓰고 있어요&apos;에 내 별명 보이기를 켜면 기술 상세의 &apos;쓰고 있어요 n명&apos;에 내 별명이 들어가요. 끄면 수에서도 빠져요. 내 프로젝트·판단·기록은 켜도 꺼도 다른 사용자에게 보이지 않아요.
        </div>
      ) : null}
      {error || !data ? (
        <div className="notice notice-error" role="alert"><strong>설정을 불러오지 못했어요.</strong> 잠시 뒤에 다시 열어 주세요.</div>
      ) : (
        <SettingsForm nickname={isTempNickname(user.nickname, user.id) ? "" : user.nickname} isPublic={data.is_public} welcome={welcome} next={safeNext(params.next)} />
      )}
      <p className="muted">로그인 방법: 구글</p>
      <p><Link href="/taste">취향 고치기</Link></p>
    </main>
  );
}
