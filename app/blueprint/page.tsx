// 블루프린트 = 설계도 판(design.md 14절 ⑤, 11-21 사용자 결정 "시안 거의 전부"): 단계를 순서 · 나란히로 놓고 단계마다 쓸 기술을 붙여
// 확정하면 내 이력에 쌓이고, 프롬프트 · CLAUDE.md 글 · 메타프롬프트로 내보낸다. 로그인 전에는 그 자리 안내(LoginNeeded).
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/server/current-user";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { SAMPLE_BLUEPRINT } from "@/lib/dev/preview-data";
import { readBlueprintPage } from "@/lib/server/blueprints";
import { getServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/domain/my-tech-view";
import { backTo, LoginNeeded } from "../login/login-needed";
import { readMyTechTagMap } from "@/lib/server/my-tech-tags";
import { Studio } from "./studio";
import "../alerts/alerts.css";
import "./blueprint.css";

export const metadata = { title: "청사진 · TechRadar" };

/** add: 보드의 "청사진에 넣기"가 실어 보낸 기술 id(11-21 화면 개편 C). uuid 모양이 아니면 버린다 */
export default async function BlueprintPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <LoginNeeded title="청사진" why="로그인하면 단계마다 쓸 기술을 골라 내 청사진을 만들고, 확정한 조합을 내 이력으로 쌓을 수 있어요." next={backTo("/blueprint", await searchParams)} />;
  const { add } = await searchParams;
  const preview = isPreviewUser(user); // 미리보기(개발용)는 DB 없이 샘플로
  const db = preview ? null : await getServerSupabase();
  const [data, tagMap] = preview ? [SAMPLE_BLUEPRINT, new Map<string, string[]>()] : db ? await Promise.all([
    readBlueprintPage(db, user.id).catch((e) => { console.error("블루프린트 화면 조회 실패", e instanceof Error ? e.message : e); return null; }),
    readMyTechTagMap(db, user.id).catch((e) => { console.error("청사진 내 태그 조회 실패", e instanceof Error ? e.message : e); return null; }), // 못 읽어도 판은 열고 태그만 "읽지 못함"
  ]) : [null, null];
  return (
    <main className="alerts bp-page">
      <h1 className="sr-only">청사진</h1>
      {/* 하단 패널이 주소의 add=를 읽어(useSearchParams) Suspense로 감싼다 */}
      {data ? <Suspense fallback={<p className="muted bp-wait">판을 준비하는 중…</p>}><Studio who={user.id} {...data} tags={tagMap ? Object.fromEntries(tagMap) : null} add={isUuid(add) ? add : null} /></Suspense>
        : <div className="notice notice-error" role="alert"><strong>내 기술을 읽지 못했어요.</strong> 기술이 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</div>}
    </main>
  );
}
