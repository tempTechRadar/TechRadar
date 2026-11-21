// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 청사진 스튜디오 패널(P-12e 조각 K — 하단 패널 · 속성 패널 · 목록 모드)을 캔버스 없이 눈으로 보는 용도. 배포에서는 404.
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SAMPLE_BLUEPRINT, SAMPLE_TAGS } from "@/lib/dev/preview-data";
import { PanelsSample } from "./panels-sample";
import "../../blueprint/studio.css"; // 기술 칩(tech-chip) 모양

export default function StudioPanelsSamplePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="page">
      <h1>청사진 패널 샘플 (실제 기록 아님)</h1>
      <p role="note" className="notice notice-empty">개발 컴퓨터에서만 보이는 화면이에요. 캔버스 자리는 비워 두고 패널 셋만 붙였어요. 사용기 · 내 태그 저장은 로그인해야 읽혀요.</p>
      <Suspense><PanelsSample {...SAMPLE_BLUEPRINT} tags={SAMPLE_TAGS} /></Suspense>
    </main>
  );
}
