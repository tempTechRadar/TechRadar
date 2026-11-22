// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 첫 화면 지도(P-12c)를 가짜 기술로 눈으로 보는 용도. 배포에서는 404.
// ?mode=catalog 이면 프로젝트가 없는 사람의 지도. 보기 설정은 실제 화면과 같이 주소(g·c·fk·ff·risky·new·mine·p)로.
import { notFound } from "next/navigation";
import { buildTechMap } from "@/lib/map/build-map";
import { SAMPLE_NOW, SAMPLE_PROJECTS, sampleMapInput } from "@/lib/dev/preview-data";
import { CanvasMap } from "../../tech-map/canvas-map";

export default async function MapSamplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams, catalog = params.mode === "catalog";
  const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "mode")).toString();
  const model = buildTechMap(sampleMapInput(catalog), SAMPLE_NOW);
  return (
    <main className="page map-page">
      <h1 className="sr-only">기술 지도 샘플</h1>
      <CanvasMap model={model} projects={SAMPLE_PROJECTS} initialQuery={query} canSave login={!catalog} />
    </main>
  );
}
