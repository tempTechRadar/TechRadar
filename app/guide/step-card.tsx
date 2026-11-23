"use client";
// Tutorial 단계 카드 한 장(I-tutorial-motion): 왼쪽 행동 목록 + 오른쪽 장면. 장면이 재생 중인 행동이 왼쪽에서 은은하게 강조되고, 행동을 누르면 그 대목부터 재생한다.
// 스크립트 전 · 움직임 줄이기면 행동은 그냥 글이고 장면은 정지 그림이다.
import Link from "next/link";
import { useRef } from "react";
import { SCENES } from "@/lib/tutorial/guide-scenes";
import { LOGIN_LABEL, STEPS, splitUiNames, stepHash, type GuideStep } from "@/lib/tutorial/guide-steps";
import { SceneStage } from "./scene-stage";
import { useScene } from "./use-scene";

const Ui = ({ text }: { text: string }) => <>{splitUiNames(text).map((p, i) => (p.ui ? <b key={i} className="g-ui">{p.text}</b> : <span key={i}>{p.text}</span>))}</>;
const two = (n: number) => String(n).padStart(2, "0");

/** 마우스 화면에서만: 커서 근처가 은은히 밝아지는 스포트라이트(좌표 → CSS 변수, 한 장에 한 번만 쓴다) */
function useSpotlight() {
  const raf = useRef(0);
  return (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || raf.current) return;
    const el = e.currentTarget, x = e.clientX, y = e.clientY;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${Math.round(x - r.left)}px`); el.style.setProperty("--my", `${Math.round(y - r.top)}px`);
    });
  };
}

type Props = {
  step: GuideStep; index: number; cur: number | null; calm: boolean | null; present: boolean;
  onLink: (i: number, focus: boolean) => (e: React.MouseEvent) => void; onSceneEnd?: () => void;
};

export function StepCard({ step: s, index: i, cur, calm, present, onLink, onSceneEnd }: Props) {
  const scene = SCENES[s.id];
  const player = useScene(scene, { active: cur === i, calm: cur === null ? null : calm, onEnd: onSceneEnd });
  const spot = useSpotlight();
  const live = player.motion && !player.done;
  return (
    <article id={`step-${i + 1}`} className="g-card-step" hidden={cur !== null && cur !== i} aria-labelledby={`step-${i + 1}-title`} onPointerMove={present ? undefined : spot}>
      <header className="g-card-head">
        <span className="g-count"><b>{two(i + 1)}</b><span> / {two(STEPS.length)}</span></span>
        <h3 id={`step-${i + 1}-title`} tabIndex={-1}>{s.title}</h3>
        <span className="tag">{LOGIN_LABEL[s.login]}</span>
      </header>
      <p className="g-gist">{s.gist}</p>
      <div className="g-card-body">
        <div className="g-actions-col">
          <ol className="g-actions">{s.actions.map((a, k) => (
            <li key={a} data-now={live && player.frame.action === k ? "" : undefined} aria-current={live && player.frame.action === k ? "step" : undefined}>
              {player.motion
                ? <button type="button" className="g-act" onClick={() => player.seek(k)}><Ui text={a} /><span className="sr-only"> (누르면 이 대목부터 시연)</span></button>
                : <span><Ui text={a} /></span>}
            </li>
          ))}</ol>
          {player.motion && !present ? <p className="g-fine g-act-hint">행동을 누르면 그 대목부터 시연해요.</p> : null}
          {s.fine ? <p className="g-fine">{s.fine}</p> : null}
          {s.gradeLink ? <p className="g-fine g-grade-link"><a href="#g-grades">등급 뜻 보기 ↓</a></p> : null}
        </div>
        <SceneStage id={s.id} scene={scene} steps={s.actions.length} player={player} />
      </div>
      <footer className="g-card-foot">
        <Link className="btn" href={s.href}>{s.hrefLabel} 화면으로 가기</Link>
        <span className="g-pager">
          {i > 0 ? <a className="btn" href={stepHash(i - 1)} onClick={onLink(i - 1, true)}>← 이전</a> : null}
          {i < STEPS.length - 1 ? <a className="btn" href={stepHash(i + 1)} onClick={onLink(i + 1, true)}>다음: {STEPS[i + 1].title} →</a> : <a className="btn" href="#g-done">다 봤어요 ↓</a>}
        </span>
      </footer>
    </article>
  );
}
