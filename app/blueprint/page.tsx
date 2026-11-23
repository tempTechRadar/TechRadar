// 청사진 스튜디오(P-12e, design.md 14절 ⑤): 캔버스에 단계를 두고 선으로 순서를 이어 단계마다 쓸 기술을 붙인다.
// 확정하면 내 이력에 쌓이고, 프롬프트 · CLAUDE.md 글 · 메타프롬프트로 내보낸다.
// 로그인 전(P-12f 손님 모드): 판은 이 브라우저에만, 서랍은 카탈로그 찾기, 개인 데이터는 읽지 않는다(불변 5). 템플릿은 열린 것만(M6).
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/server/current-user";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { SAMPLE_BLUEPRINT } from "@/lib/dev/preview-data";
import { readAllowedTechIds, readBlueprintPage } from "@/lib/server/blueprints";
import { getServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/domain/my-tech-view";
import { readMyTechTagMap } from "@/lib/server/my-tech-tags";
import { readTemplateForUse } from "@/lib/server/blueprint-templates";
import { readGuestMap } from "@/lib/server/guest-map";
import { catalogToPool } from "@/lib/blueprint/catalog-pool";
import type { PoolTech } from "@/lib/server/blueprints";
import { Studio } from "./studio";
import { GUEST } from "./use-studio-graph";
import "./blueprint.css";

export const metadata = { title: "청사진 · TechRadar" };

/** add: 보드의 "청사진에 넣기"가 실어 보낸 기술 id(11-21 화면 개편 C). template: 갤러리의 "이 템플릿으로 시작"(P-12e).
 *  bp: 보드의 확정한 청사진 이름(P-12n R3-3) — 내 이력에서 그 청사진을 불러온다(손님은 이력이 없어 무시). uuid 모양이 아니면 버린다 */
export default async function BlueprintPage({ searchParams }: { searchParams: Promise<{ add?: string; template?: string; bp?: string }> }) {
  const user = await getCurrentUser();
  const preview = !!user && isPreviewUser(user); // 미리보기(개발용)는 DB 없이 샘플로
  const { add, template, bp } = await searchParams;
  const log = (what: string) => (e: unknown) => { console.error(what, e instanceof Error ? e.message : e); return null; };
  const want = isUuid(template) ? template : null;
  // 서랍 "지도 전체"(P-12o): 지도 손님 목록(공개 칸만, 10분 캐시)을 서랍 카드로. 못 읽으면 null(서랍이 "읽지 못함"을 보임, 불변 2)
  const map = preview ? null : await readGuestMap().catch(log("청사진 지도 전체 조회 실패"));
  const catalog = (have: Iterable<string>): PoolTech[] | null => (map ? catalogToPool(map.techs, map.categories, have) : null);
  if (!user) {
    const anon = want ? await getServerSupabase() : null; // 손님 토큰: blueprint_template_for_use가 열린 템플릿만 준다(M6)
    const tpl = anon && want ? await readTemplateForUse(anon, want, true).catch(log("손님 템플릿 조회 실패")) : null;
    return (
      <main className="page bp-page">
        <h1 className="sr-only">청사진</h1>
        <Suspense fallback={<p className="muted bp-wait">판을 준비하는 중…</p>}><Studio who={GUEST} guest pool={[]} catalog={catalog([])} history={[]} projects={[]} tags={{}} add={null}
          template={tpl} templateMissing={!!want && !tpl} /></Suspense>
      </main>
    );
  }
  const db = preview ? null : await getServerSupabase();
  const [page, tagMap, allowed, tpl] = preview ? [SAMPLE_BLUEPRINT, new Map<string, string[]>(), null, null] : db ? await Promise.all([
    readBlueprintPage(db, user.id).catch((e) => { console.error("블루프린트 화면 조회 실패", e instanceof Error ? e.message : e); return null; }),
    readMyTechTagMap(db, user.id).catch((e) => { console.error("청사진 내 태그 조회 실패", e instanceof Error ? e.message : e); return null; }), // 못 읽어도 판은 열고 태그만 "읽지 못함"
    // 하단 패널 서랍 = 확정 DB 함수의 관문과 같은 목록. 못 읽으면(M1 적용 전 등) 같은 규칙으로 계산한 서랍을 그대로 쓴다
    readAllowedTechIds(db).catch(log("청사진 관문 목록 조회 실패")),
    want ? readTemplateForUse(db, want).catch(log("템플릿 조회 실패")) : null, // null = 못 열음(없음 · 남의 비공개 · 조회 실패)
  ]) : [null, null, null, null];
  const data = page && allowed ? { ...page, pool: page.pool.filter((t) => allowed.has(t.id)) } : page;
  return (
    <main className="page bp-page">
      <h1 className="sr-only">청사진</h1>
      {/* 하단 패널이 주소의 add=를 읽어(useSearchParams) Suspense로 감싼다 */}
      {data ? <Suspense fallback={<p className="muted bp-wait">판을 준비하는 중…</p>}><Studio who={user.id} {...data} catalog={preview ? [] : catalog(data.pool.map((t) => t.id))} tags={tagMap ? Object.fromEntries(tagMap) : null} add={isUuid(add) ? add : null} bp={isUuid(bp) ? bp : null}
        template={tpl} templateMissing={!!want && !tpl} /></Suspense>
        : <div className="notice notice-error" role="alert"><strong>사용 중인 항목을 불러오지 못했어요.</strong> 기술이 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</div>}
    </main>
  );
}
