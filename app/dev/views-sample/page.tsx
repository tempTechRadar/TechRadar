// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 갤러리·내 레이더·자리 화면을 가짜 내 기술로 눈으로 보는 용도. 배포에서는 404.
import { notFound } from "next/navigation";
import { galleryCards, type GalleryRow } from "@/lib/views/gallery";
import { buildRadar } from "@/lib/views/radar";
import { Gallery, NewsPlaceholder, Radar, UsingNowPlaceholder } from "../../views/view-parts";

const row = (id: string, name: string, grade: GalleryRow["grade"], extra: Partial<GalleryRow> = {}): GalleryRow => ({
  id, name, version: "1.0.0", grade, gradeReason: null, collectErrorKind: null, lastCheckedOkAt: null, projectName: "시연 저장소", ...extra,
});
const ROWS = [
  row("a", "mcp-remote", "danger", { version: "0.1.15", gradeReason: "GHSA-6xpm-ggf7-wc3p — 0.1.16에서 고침" }),
  row("b", "@supabase/supabase-js", "pass", { version: "2.119.0" }),
  row("c", "@modelcontextprotocol/inspector", "caution", { version: "0.16.6" }),
  row("d", "mcp-server-time", "pass", { collectErrorKind: "network" }),
  row("e", "demo-skill", "unknown", { version: null, projectName: "내 컴퓨터(프로젝트 밖)" }),
];

export default function ViewsSamplePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const rings = buildRadar(ROWS.map((r) => ({ id: r.id, label: r.name, grade: r.grade })), [
    { myTechnologyId: "a", createdAt: "2026-11-18", judgment: { decision: "candidate", judgedAt: "2026-11-18" } },
    { myTechnologyId: "c", createdAt: "2026-11-18", judgment: null },
    { myTechnologyId: "e", createdAt: "2026-11-17", judgment: { decision: "hold", judgedAt: "2026-11-17" } },
  ]);
  return (
    <main>
      <h1>보기 샘플 (실제 기록 아님)</h1>
      <p role="note" style={{ background: "#fff1d6", padding: "8px 12px", borderRadius: 8 }}>개발 컴퓨터에서만 보이는 화면이에요. 가짜 내 기술 5개로 그렸어요.</p>
      <h2>갤러리</h2>
      <Gallery cards={galleryCards(ROWS)} />
      <h2>내 레이더</h2>
      <Radar rings={rings} />
      <h2>자리만 있는 보기</h2>
      <div style={{ display: "grid", gap: 12 }}>
        <NewsPlaceholder />
        <UsingNowPlaceholder />
      </div>
    </main>
  );
}
