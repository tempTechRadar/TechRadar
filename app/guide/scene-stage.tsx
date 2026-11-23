"use client";
// 장면 틀(I-tutorial-motion): 그림(mocks.tsx) + 가짜 커서 + 눌림 파문 + 조작 단추(재생 · 처음부터 · 진행 막대).
// 그림은 설계 폭 440px로 그린 뒤 칸 폭에 맞춰 통째로 줄이거나 키운다(CSS 컨테이너 단위 + tan(atan2())로 비율을 구함, 스크립트 없이도 맞음. 못 쓰는 브라우저만 아래에서 잰다).
// 그림 · 커서는 누를 수 없고(pointer-events: none) 화면 읽기에 숨긴다. 진짜 단추는 조작 단추뿐이다.
import { useEffect } from "react";
import { SCENE_W, type Scene } from "@/lib/tutorial/guide-scenes";
import type { GuideStep } from "@/lib/tutorial/guide-steps";
import { CarryChip, SceneBody, type SceneView } from "./mocks";
import type { Player } from "./use-scene";

/** scale: tan(atan2(100cqw, 440px))을 모르는 브라우저에서만 폭을 재서 비율을 넣는다 */
function useScaleFallback(p: Player) {
  useEffect(() => {
    const box = p.view.current, stage = box?.firstElementChild as HTMLElement | null;
    if (!box || !stage || typeof ResizeObserver === "undefined" || CSS.supports("scale", "tan(atan2(1px, 1px))")) return;
    const ro = new ResizeObserver(() => { stage.style.scale = String(box.clientWidth / SCENE_W); });
    ro.observe(box);
    return () => ro.disconnect();
  }, [p.view]);
}

const Pointer = () => <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8.2-6.2 1.5L9.6 19z" /></svg>;

export function SceneStage({ id, scene, steps, player: p }: { id: GuideStep["id"]; scene: Scene; steps: number; player: Player }) {
  useScaleFallback(p);
  const view: SceneView = { on: (f) => p.frame.flags.includes(f), typed: (at) => p.frame.typed[at], typing: p.typing };
  const live = p.motion && !p.done;
  return (
    <figure className="g-mock" data-motion={p.motion ? "" : undefined} style={{ ["--h" as string]: scene.h }}>
      <figcaption>
        {p.motion ? <><span>시연</span><span className="muted">실제 화면에서 이 순서로 눌러요. 숫자는 왼쪽 순서</span></> : <><span>모양 예시</span><span className="muted">실제 화면에서 이렇게 생긴 걸 찾아요. 숫자는 왼쪽 순서</span></>}
        <span className="tag">그림 · 누를 수 없어요</span>
      </figcaption>
      <div className="g-view" ref={p.view} aria-hidden="true">
        <div className="g-stage" data-act={live ? p.frame.action + 1 : undefined}>
          <div className="g-mock-body"><SceneBody id={id} view={view} /></div>
          <span className="g-ripple" ref={p.ripple} />
          <span className="g-cursor" ref={p.cursor} data-hide={live ? undefined : ""}><Pointer /><span className="g-ghost"><CarryChip /></span></span>
        </div>
      </div>
      {p.motion ? (
        <div className="g-ctl">
          <button type="button" className="g-ctl-play" aria-pressed={p.playing} aria-label="시연 재생" title={p.playing ? "일시정지" : "재생"} onClick={p.toggle}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">{p.playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5l11 7-11 7z" />}</svg>
          </button>
          <button type="button" className="btn g-btn-sm" onClick={p.restart}>{p.done ? "다시 보기" : "처음부터"}</button>
          <span className="g-bar" ref={p.bar} aria-hidden="true">{Array.from({ length: steps }, (_, k) => (
            <i key={k} data-state={p.done || k < p.frame.action ? "past" : k === p.frame.action ? "now" : undefined} />
          ))}</span>
          <span className="g-ctl-say" aria-live="polite">{p.done ? "시연 끝" : p.playing ? "재생 중" : "멈춤"}</span>
        </div>
      ) : null}
    </figure>
  );
}
