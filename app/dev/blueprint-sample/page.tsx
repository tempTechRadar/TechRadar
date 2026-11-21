// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 블루프린트 판 · 서랍 · 이력을 가짜 내 기술로 눈으로 보는 용도. 배포에서는 404.
// 확정 · 카탈로그 찾기는 실제 서버 액션이라 여기서는 로그인 없이 실패 안내가 뜬다(그 모양 확인용).
import { notFound } from "next/navigation";
import { SAMPLE_BLUEPRINT } from "@/lib/dev/preview-data";
import { BlueprintApp } from "../../blueprint/blueprint-app";
import "../../alerts/alerts.css";
import "../../blueprint/blueprint.css";

export default function BlueprintSamplePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="alerts bp-page">
      <h1 className="sr-only">청사진 샘플</h1>
      <BlueprintApp who="sample" {...SAMPLE_BLUEPRINT} />
    </main>
  );
}
