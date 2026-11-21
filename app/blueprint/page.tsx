// 블루프린트 = 설계도 판(design.md 14절 ⑤, 11-21 사용자 결정 "시안 거의 전부"): 단계를 순서 · 나란히로 놓고 단계마다 쓸 기술을 붙여
// 확정하면 내 이력에 쌓이고, 프롬프트 · CLAUDE.md 글 · 메타프롬프트로 내보낸다. 로그인 전에는 그 자리 안내(LoginNeeded).
import { getCurrentUser } from "@/lib/server/current-user";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { SAMPLE_BLUEPRINT } from "@/lib/dev/preview-data";
import { readBlueprintPage } from "@/lib/server/blueprints";
import { getServerSupabase } from "@/lib/supabase/server";
import { LoginNeeded } from "../login/login-needed";
import { BlueprintApp } from "./blueprint-app";
import "../alerts/alerts.css";
import "./blueprint.css";

export const metadata = { title: "블루프린트 · TechRadar" };

export default async function BlueprintPage() {
  const user = await getCurrentUser();
  if (!user) return <LoginNeeded title="블루프린트" why="로그인하면 단계마다 쓸 기술을 골라 내 개발 설계도를 만들고, 확정한 조합을 내 이력으로 쌓을 수 있어요." next="/blueprint" />;
  const db = await getServerSupabase();
  const data = isPreviewUser(user) ? SAMPLE_BLUEPRINT /* 미리보기(개발용) */ : db ? await readBlueprintPage(db, user.id).catch((e) => { console.error("블루프린트 화면 조회 실패", e instanceof Error ? e.message : e); return null; }) : null;
  return (
    <main className="alerts bp-page">
      <h1 className="sr-only">블루프린트</h1>
      {data ? <BlueprintApp who={user.id} {...data} />
        : <div className="notice notice-error" role="alert"><strong>내 기술을 읽지 못했어요.</strong> 기술이 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</div>}
    </main>
  );
}
