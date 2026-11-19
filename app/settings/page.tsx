import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import { isTempNickname } from "@/lib/domain/nickname";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";
import "../alerts/alerts.css";

// 설정(IA-19, PRD-F34·F1): 별명과 "쓰고 있어요"에 내 별명 보이기(기본 켜짐). 가입 직후(임시 별명)에는 별명을 먼저 정하게 한다(IA-1).
type Params = { welcome?: string; next?: string };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  const params = await searchParams;
  const supabase = (await getServerSupabase())!;
  const { data, error } = await supabase.from("profiles").select("is_public").eq("id", user.id).single();
  if (error || !data) console.error("설정을 읽지 못함", error?.message);
  const welcome = isTempNickname(user.nickname, user.id); // 임시 별명일 때만(주소의 welcome 값은 믿지 않는다)

  return (
    <main className="alerts">
      <h1>설정</h1>
      {welcome ? (
        <div className="notice notice-empty">
          <strong>가입을 마치려면 별명을 정해 주세요.</strong> 내 기술 목록은 다른 사용자에게 &apos;쓰고 있어요&apos;로 별명과 함께 보여요. 아래에서 숨길 수도 있어요.
        </div>
      ) : null}
      {error || !data ? (
        <div className="notice notice-error" role="alert"><strong>설정을 불러오지 못했어요.</strong> 잠시 뒤에 다시 열어 주세요.</div>
      ) : (
        <SettingsForm nickname={isTempNickname(user.nickname, user.id) ? "" : user.nickname} isPublic={data.is_public} welcome={welcome} next={safeNext(params.next)} />
      )}
      <p className="muted">로그인 방법: 구글</p>
    </main>
  );
}
