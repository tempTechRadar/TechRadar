import Link from "next/link";
import { redirect } from "next/navigation";
import { parseCompareSelection } from "@/lib/alerts/parse-compare-selection";
import { listCatalogTechs, readTechsForCompare } from "@/lib/server/compare-queries";
import { PreviewOnly } from "@/app/dev/preview-only";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { CompareTable } from "./compare-table";

// 기술 비교(IA 메뉴 "비교", PRD-F42): 기술 2–3개를 골라 나란히. 와이어프레임 docs/wireframes/extras.html.
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ techs?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isPreviewUser(user)) return <PreviewOnly title="기술 비교" />; // 미리보기(개발용)는 DB를 부르지 않는다
  const selection = parseCompareSelection((await searchParams).techs);
  const supabase = (await getServerSupabase())!;
  const catalog = await listCatalogTechs(supabase).catch((e) => { console.error("기술 목록 조회 실패", e); return null; });
  const found = selection.state === "ok" ? await readTechsForCompare(supabase, selection.ids).catch((e) => { console.error("비교할 기술 조회 실패", e); return null; }) : undefined;

  return (
    <main className="page">
      <h1>기술 비교</h1>
      <p className="muted">비교할 기술을 2개에서 3개까지 골라 주세요. 값과 출처는 적용 기회 비교표와 같은 항목이에요.</p>
      {catalog === null ? <LoadError what="기술 목록" /> : <Picker catalog={catalog} selected={selection.state === "ok" ? selection.ids : []} />}
      {selection.state === "invalid" && <div className="notice notice-empty" role="status"><strong>{selection.message}</strong></div>}
      {found === null && <LoadError what="비교할 기술" />}
      {found && found.length < 2 && <div className="notice notice-empty" role="status"><strong>고른 기술을 찾지 못했어요.</strong> 다시 골라 주세요.</div>}
      {found && found.length >= 2 && (
        <>
          {selection.state === "ok" && found.length < selection.ids.length && <div className="notice notice-empty" role="status">고른 기술 중 {selection.ids.length - found.length}개를 찾지 못했어요.</div>}
          <CompareTable techs={found} />
        </>
      )}
    </main>
  );
}

function Picker({ catalog, selected }: { catalog: { id: string; name: string }[]; selected: string[] }) {
  if (catalog.length === 0) return <div className="notice notice-empty"><strong>아직 비교할 기술이 없어요.</strong> 프로젝트를 <Link href="/projects">등록</Link>하면 기술이 모여요.</div>;
  return (
    <form className="card" method="get" aria-labelledby="pick-legend">
      <fieldset className="pick">
        <legend id="pick-legend">비교할 기술</legend>
        {catalog.map((tech) => (
          <label key={tech.id}><input type="checkbox" name="techs" value={tech.id} defaultChecked={selected.includes(tech.id)} /> {tech.name}</label>
        ))}
      </fieldset>
      <div className="actions"><button type="submit" className="btn btn-primary">비교하기</button></div>
    </form>
  );
}

function LoadError({ what }: { what: string }) {
  return (
    <div className="notice notice-error" role="alert">
      <strong>{what}을 불러오지 못했어요.</strong> 없는 게 아니에요. 잠시 뒤에 다시 불러와 주세요. <Link href="/compare">다시 불러오기</Link>
    </div>
  );
}
