"use client";
// 장면 재생기(I-tutorial-motion): lib/tutorial/guide-scenes.ts의 박자를 시간에 맞춰 넘긴다.
// 시계는 requestAnimationFrame 하나: 커서 자리(translate) · 진행 막대(--p)는 DOM에 바로 쓰고, 그림이 바뀔 때(상태 · 글자 수)만 React를 다시 그린다.
// 도는 조건: 재생 의도(playing) + 지금 단계(active) + 화면에 보임 + 탭이 보임 + 움직임 줄이기 아님. 한 번 돌면 끝 프레임에서 멈춘다(되풀이 없음).
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { SCENE_W, actionProgress, cursorFrom, easeInOut, endFrame, firstBeatOf, frameAt, moveMs, typedCount, type Frame, type Scene } from "@/lib/tutorial/guide-scenes";
import { sceneBusy } from "./motion-bus";

/** 움직임 줄이기 설정. null = 아직 모름(서버 그림 · 첫 그림): 정지 그림으로 둔다 */
export function useCalm(): boolean | null {
  const [calm, setCalm] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setCalm(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return calm;
}

export type Player = {
  frame: Frame; typing: string | null;
  /** 움직이는 장면인지(거짓 = 정지 그림: 서버 · 움직임 줄이기) */
  motion: boolean; playing: boolean; done: boolean;
  toggle: () => void; restart: () => void; seek: (action: number) => void;
  view: RefObject<HTMLDivElement | null>; cursor: RefObject<HTMLSpanElement | null>; ripple: RefObject<HTMLSpanElement | null>; bar: RefObject<HTMLSpanElement | null>;
};
type Pos = { i: number; t: number };
type Pt = [number, number];
const frameKey = (s: Scene, p: Pos) => { const b = s.beats[p.i]; return `${p.i}|${p.t >= moveMs(b) ? 1 : 0}|${typedCount(b, p.t)}`; };

/** 장면 안 이름(data-t)의 가운데를 설계 좌표(폭 SCENE_W)로. 없으면 구석의 대기 자리 */
function pointOf(view: HTMLElement, name: string | null, h: number): Pt {
  const el = name ? view.querySelector<HTMLElement>(`[data-t="${name}"]`) : null;
  if (!el) return [SCENE_W - 48, h - 36];
  const box = view.getBoundingClientRect(), r = el.getBoundingClientRect(), k = box.width / SCENE_W || 1;
  return [(r.left + (r.width > 240 * k ? 34 * k : r.width / 2) - box.left) / k, // 넓은 줄 · 칸은 왼쪽 머리를 가리킨다(글자를 가리지 않게)
    (r.top + r.height / 2 - box.top) / k];
}

function useShown(ref: RefObject<HTMLElement | null>, on: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el || typeof IntersectionObserver === "undefined") { setShown(false); return; }
    let inView = false;
    const sync = () => setShown(inView && !document.hidden);
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { threshold: 0.4 });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, [ref, on]);
  return shown;
}

export function useScene(scene: Scene, opts: { active: boolean; calm: boolean | null; onEnd?: () => void }): Player {
  const { active, calm } = opts;
  const motion = calm === false;
  const view = useRef<HTMLDivElement>(null), cursor = useRef<HTMLSpanElement>(null), ripple = useRef<HTMLSpanElement>(null), bar = useRef<HTMLSpanElement>(null);
  const pos = useRef<Pos>({ i: 0, t: 0 });
  const path = useRef<{ i: number; from: Pt; to: Pt } | null>(null); // 박자마다 한 번만 잰다(매 장 재지 않음)
  const pressed = useRef(-1);
  const onEnd = useRef(opts.onEnd);
  onEnd.current = opts.onEnd;
  const [snap, setSnap] = useState<Pos>({ i: 0, t: 0 });
  const [playing, setPlaying] = useState(true); // 의도: 보이면 스스로 재생
  const [done, setDone] = useState(false);
  const shown = useShown(view, motion && active);

  /** 지금 자리(pos)를 화면에 쓴다: 커서 · 눌림 파문 · 진행 막대 */
  const paint = useCallback(() => {
    const box = view.current, cur = cursor.current, p = pos.current, b = scene.beats[p.i];
    if (!box || !cur || !b) return;
    if (path.current?.i !== p.i) path.current = { i: p.i, from: pointOf(box, cursorFrom(scene, p.i), scene.h), to: pointOf(box, b.to ?? cursorFrom(scene, p.i), scene.h) };
    const { from, to } = path.current, mv = moveMs(b), k = mv ? easeInOut(p.t / mv) : 1;
    const x = from[0] + (to[0] - from[0]) * k, y = from[1] + (to[1] - from[1]) * k;
    cur.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    cur.toggleAttribute("data-carry", !!b.carry && p.t < mv);
    bar.current?.style.setProperty("--p", actionProgress(scene, p.i, p.t).toFixed(3));
    if (b.press && p.t >= mv && pressed.current !== p.i) {
      pressed.current = p.i;
      const rp = ripple.current;
      if (rp) { rp.style.translate = `${to[0].toFixed(1)}px ${to[1].toFixed(1)}px`; rp.animate?.([{ opacity: 0.85, scale: 0.35 }, { opacity: 0, scale: 1.7 }], { duration: 520, easing: "ease-out" }); }
      cur.firstElementChild?.animate?.([{ scale: 1 }, { scale: 0.82 }, { scale: 1 }], { duration: 260, easing: "ease-out" });
    }
  }, [scene]);

  const jump = useCallback((i: number) => {
    pos.current = { i: Math.max(0, i), t: 0 }; path.current = null; pressed.current = -1;
    setSnap({ ...pos.current }); setDone(false); setPlaying(true);
    requestAnimationFrame(paint); // 새 그림이 그려진 뒤 커서 자리를 맞춘다
  }, [paint]);

  // 이 단계로 올 때마다 처음부터(다른 단계에 있다 오면 끝난 그림이 아니라 시연이 다시 보이게)
  useEffect(() => { if (motion && active) jump(0); }, [motion, active, jump]);

  const run = motion && active && shown && playing && !done;
  useEffect(() => {
    if (!run) return;
    let raf = 0, last = performance.now(), key = frameKey(scene, pos.current);
    sceneBusy.count++;
    const tick = (now: number) => {
      const p = pos.current;
      p.t += Math.min(64, now - last); last = now; // 탭이 멈췄다 돌아와도 건너뛰지 않게
      while (p.i < scene.beats.length && p.t >= scene.beats[p.i].ms) { p.t -= scene.beats[p.i].ms; p.i++; }
      if (p.i >= scene.beats.length) { setDone(true); setPlaying(false); onEnd.current?.(); return; }
      paint();
      const k = frameKey(scene, p);
      if (k !== key) { key = k; setSnap({ ...p }); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); sceneBusy.count--; };
  }, [run, scene, paint]);

  // 폭이 바뀌면 커서 자리를 다시 잰다
  useEffect(() => {
    const el = view.current;
    if (!motion || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { path.current = null; paint(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [motion, paint]);

  const still = !motion || done;
  const beat = scene.beats[snap.i];
  const frame = still || !beat ? endFrame(scene) : frameAt(scene, snap.i, snap.t);
  const typing = !still && beat?.type && snap.t >= moveMs(beat) && typedCount(beat, snap.t) < [...beat.type.text].length ? beat.type.at : null;
  return {
    frame, typing, motion, playing: playing && !done, done,
    toggle: () => (done ? jump(0) : setPlaying((v) => !v)), restart: () => jump(0), seek: (a) => jump(firstBeatOf(scene, a)),
    view, cursor, ripple, bar,
  };
}
