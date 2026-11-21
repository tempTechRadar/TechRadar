// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 갤러리·내 레이더·자리 화면을 가짜 내 기술로 눈으로 보는 용도. 배포에서는 404.
import { notFound } from "next/navigation";
import { SAMPLE_GALLERY, SAMPLE_KANBAN } from "@/lib/dev/preview-data";
import { galleryCards } from "@/lib/views/gallery";
import { buildKanban } from "@/lib/views/kanban";
import { Kanban } from "../../views/kanban";
import { Gallery, NewsPlaceholder, UsingNowPlaceholder } from "../../views/view-parts";
import "../../alerts/alerts.css";
import "../../views/views.css";

export default function ViewsSamplePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="alerts views-page">
      <h1>보기 샘플 (실제 기록 아님)</h1>
      <p role="note" className="notice notice-empty">개발 컴퓨터에서만 보이는 화면이에요. 가짜 내 기술 {SAMPLE_GALLERY.length}개로 그렸어요.</p>
      <h2>갤러리</h2>
      <Gallery cards={galleryCards(SAMPLE_GALLERY)} />
      <h2>내 레이더</h2>
      <Kanban columns={buildKanban(SAMPLE_KANBAN)} />
      <h2>자리만 있는 보기</h2>
      <div style={{ display: "grid", gap: 12 }}>
        <NewsPlaceholder />
        <UsingNowPlaceholder />
      </div>
    </main>
  );
}
