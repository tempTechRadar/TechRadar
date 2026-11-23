"use client";
// Tutorial 따라 하기 6단계(점진적 향상): 서버 그림은 모든 단계 카드를 위아래로 다 보인다(스크립트가 꺼져도 다 읽힘, 레일 · 이전 · 다음은 #step-n 링크로 동작).
// 스크립트가 돌면 한 번에 한 카드만 보이고, 주소 해시(#step-3)로 단계를 공유하며, ← → 키로 넘긴다.
// I-tutorial-motion: 여정 레일("지키고 → 고르고 → 옮긴다" 위의 6단계 점) · 단계 전환은 View Transitions(없으면 그냥 바뀜) · 발표 모드(6단계 시연을 차례로 자동 재생).
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MOTTO, STEPS, moveStep, phaseOf, stepFromHash, stepHash } from "@/lib/tutorial/guide-steps";
import { StepCard } from "./step-card";
import { useCalm } from "./use-scene";

/** 글을 쓰는 칸 · 펼침 단추에 초점이 있으면 화살표를 가로채지 않는다 */
const typing = (el: Element | null) => !!el && (el.matches("input, textarea, select, [contenteditable]") || !!el.closest("[contenteditable]"));
/** 발표 모드: 장면이 끝난 뒤 다음 단계로 넘어가기까지(ms) · 움직임 줄이기면 정지 그림을 보여 두는 시간(ms) */
const NEXT_AFTER_MS = 1200, STILL_STAY_MS = 7000;

/** 발표 모드 동안 단계 영역 밖을 못 누르게(inert) 하고 뒤 화면이 굴러가지 않게 한다 */
function useStageOnly(box: React.RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    if (!on || !box.current) return;
    const off: Element[] = [];
    for (let el: Element = box.current; el.parentElement && el !== document.body; el = el.parentElement) {
      for (const sib of el.parentElement.children) if (sib !== el && !sib.hasAttribute("inert")) { sib.setAttribute("inert", ""); off.push(sib); }
    }
    const root = document.documentElement, before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { off.forEach((el) => el.removeAttribute("inert")); root.style.overflow = before; };
  }, [box, on]);
}

export function Guide() {
  const [cur, setCur] = useState<number | null>(null); // null = 스크립트 전(모든 카드 보임)
  const [present, setPresent] = useState(false);
  const calm = useCalm();
  const box = useRef<HTMLElement>(null);
  const presentBtn = useRef<HTMLButtonElement>(null), endBtn = useRef<HTMLButtonElement>(null);
  const seen = useRef(false); // 단계 영역이 화면에 보이는지(보일 때만 문서 바탕의 ← →를 받는다)
  const nextTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => { seen.current = e.isIntersecting; });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const fromHash = stepFromHash(location.hash, STEPS.length);
    const show = new URLSearchParams(location.search).get("present") === "1";
    setCur(show ? 0 : fromHash ?? 0);
    if (show) setPresent(true);
    // 해시로 들어왔으면 카드가 접힌 뒤 자리가 바뀌므로 그 카드로 다시 맞춘다
    else if (fromHash !== null) requestAnimationFrame(() => box.current?.scrollIntoView({ block: "start" }));
    const onHash = () => { const n = stepFromHash(location.hash, STEPS.length); if (n !== null) setCur(n); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /** 단계 바꾸기: 해시는 기록을 쌓지 않고 바꾼다(뒤로 가기가 단계마다 걸리지 않게). focus = 새 카드 제목으로 초점(아래 이전 · 다음에서 눌렀을 때).
   *  View Transitions가 있으면 카드 내용이 짧게 교차 페이드하고 단계 번호가 이어진다. 없거나 움직임 줄이기면 그냥 바뀐다 */
  const go = useCallback((i: number, focus: boolean) => {
    window.clearTimeout(nextTimer.current);
    const smooth = calm === false && typeof document.startViewTransition === "function";
    if (smooth) document.startViewTransition(() => flushSync(() => setCur(i))); else setCur(i);
    history.replaceState(null, "", `${location.pathname}${location.search}${stepHash(i)}`);
    if (focus) requestAnimationFrame(() => document.getElementById(`step-${i + 1}-title`)?.focus());
  }, [calm]);

  const startPresent = useCallback(() => {
    setPresent(true); go(0, false);
    box.current?.requestFullscreen?.().catch(() => undefined); // 전체 화면은 되면 좋은 것(막혀도 발표 모드는 돈다)
  }, [go]);
  const endPresent = useCallback(() => {
    window.clearTimeout(nextTimer.current);
    setPresent(false);
    history.replaceState(null, "", `${location.pathname}${location.hash}`); // ?present=1로 왔어도 새로 고침에 다시 발표 모드로 들어가지 않게
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    requestAnimationFrame(() => presentBtn.current?.focus());
  }, []);

  useStageOnly(box, present);
  useEffect(() => {
    if (!present) return;
    endBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") endPresent(); };
    // 전체 화면에서 Esc는 브라우저가 먼저 받아 전체 화면만 푼다 → 그때도 발표 모드를 끝낸다
    let wasFull = !!document.fullscreenElement;
    const onFull = () => { if (wasFull && !document.fullscreenElement) endPresent(); wasFull = !!document.fullscreenElement; };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFull);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFull); };
  }, [present, endPresent]);

  /** 발표 모드: 장면이 끝나면 잠깐 뒤 다음 단계. 마지막 단계에서는 끝 그림에 머문다 */
  const queueNext = useCallback((from: number, after: number) => {
    window.clearTimeout(nextTimer.current);
    if (from < STEPS.length - 1) nextTimer.current = window.setTimeout(() => go(from + 1, false), after);
  }, [go]);
  useEffect(() => { // 움직임 줄이기: 장면이 끝나는 일이 없으니 정지 그림을 일정 시간 보여 주고 넘긴다
    if (present && calm && cur !== null) queueNext(cur, STILL_STAY_MS);
    return () => window.clearTimeout(nextTimer.current);
  }, [present, calm, cur, queueNext]);

  useEffect(() => {
    if (cur === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      const active = document.activeElement;
      // 초점이 단계 영역 안이거나, 문서 바탕이면서 단계 영역이 화면에 보일 때만(안 보이는 카드가 몰래 바뀌지 않게)
      const inside = !!active && !!box.current?.contains(active);
      const onBody = !active || active === document.body;
      if (typing(active) || !(inside || (onBody && seen.current))) return;
      const next = moveStep(cur, e.key === "ArrowLeft" ? -1 : 1, STEPS.length);
      if (next !== cur) { e.preventDefault(); go(next, inside && !present && !!active?.closest(".g-card-foot")); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, go, present]);

  const link = (i: number, focus: boolean) => (e: React.MouseEvent) => { e.preventDefault(); go(i, focus); };
  const at = cur ?? -1;

  return (
    <section ref={box} className="g-steps" aria-labelledby="g-steps-h" data-js={cur === null ? undefined : ""} data-present={present ? "" : undefined}>
      <div className="g-steps-head">
        <h2 id="g-steps-h">따라 하기 6단계</h2>
        {cur === null ? null : present
          ? <button ref={endBtn} type="button" className="btn" onClick={endPresent}>발표 모드 끝내기 <kbd>Esc</kbd></button>
          : <button ref={presentBtn} type="button" className="btn" onClick={startPresent}>발표 모드로 보기</button>}
      </div>
      <p className="muted g-keys">{cur === null ? "단계마다 할 일과 실제 화면 모양을 차례로 보여 줘요." : present ? "6단계 시연이 차례로 재생돼요. ← → 키로 단계를 넘길 수 있어요." : "레일에서 단계를 고르거나 ← → 키로 넘겨요. 주소를 복사하면 지금 단계로 열려요."}</p>
      <nav aria-label="단계 목록" className="g-rail" style={{ ["--at" as string]: Math.max(0, at) }}>
        <div className="g-rail-phases" aria-hidden="true">{MOTTO.map((m, k) => (
          <span key={m.verb} data-now={at >= 0 && phaseOf(STEPS[at].id) === k ? "" : undefined} style={{ gridColumn: `span ${m.steps.length}` }}>{m.verb}{k < MOTTO.length - 1 ? <i>→</i> : null}</span>
        ))}</div>
        <ol>{STEPS.map((s, i) => (
          <li key={s.id} data-past={i < at ? "" : undefined}>
            <a href={stepHash(i)} aria-current={cur === i ? "step" : undefined} onClick={link(i, false)}>
              <span className="g-num" aria-hidden="true">{i + 1}</span><span className="sr-only">{MOTTO[phaseOf(s.id)].verb}: {i + 1}단계 </span><span className="g-rail-title">{s.title}</span>
            </a>
          </li>
        ))}</ol>
      </nav>
      <div className="g-cards">{STEPS.map((s, i) => (
        <StepCard key={s.id} step={s} index={i} cur={cur} calm={calm} present={present} onLink={link}
          onSceneEnd={present ? () => queueNext(i, NEXT_AFTER_MS) : undefined} />
      ))}</div>
    </section>
  );
}
