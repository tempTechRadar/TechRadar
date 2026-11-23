"use client";
// Tutorial 맨 위 레이더 그림(I-tutorial-motion): 제품 지도의 축소판을 흉내 낸 꾸밈(Canvas 2D 한 장). 느리게 도는 선이 지나간 점이 밝아졌다 서서히 식고, 위험 점에서는 작은 고리가 퍼진다.
// 실제 기술 · 실제 확인 기록이 아니라서 "그림"이라고 적고, 캔버스는 화면 읽기에 숨긴다(같은 뜻은 옆 글 · 범례 · 한 줄 설명이 말한다).
// 도는 조건: 화면에 보임 + 탭이 보임 + "움직임 멈추기"를 누르지 않음 + 움직임 줄이기 아님. 아래 장면이 재생 중이면 선을 잠시 세운다(한 번에 한 곳만 움직임).
import { useEffect, useRef, useState } from "react";
import { COOL_MS, RADAR_CAPTION, RADAR_DOTS, RADAR_TOKENS, STILL_MS, captionOn, dotXY, glow, ring, sincePass, sweepTurn } from "@/lib/tutorial/guide-radar";
import { GRADES } from "@/lib/tutorial/guide-sections";
import { sceneBusy } from "./motion-bus";
import { useCalm } from "./use-scene";

const TAU = Math.PI * 2, STOP_KEY = "techradar.guide.radar-stopped", TRAIL = 0.2; // 꼬리 = 한 바퀴의 1/5
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };
type Ink = { scan: string; line: string; grade: string[] };

function draw(c: CanvasRenderingContext2D, w: number, h: number, ms: number, ink: Ink) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 10, ang = -Math.PI / 2 + sweepTurn(ms) * TAU;
  c.clearRect(0, 0, w, h);
  c.lineWidth = 1; c.strokeStyle = rgba(ink.line, 0.9);
  for (const k of [1 / 3, 2 / 3, 1]) { c.beginPath(); c.arc(cx, cy, R * k, 0, TAU); c.stroke(); }
  c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.strokeStyle = rgba(ink.line, 0.5); c.stroke();
  // 선 뒤로 옅어지는 꼬리 + 끝 선
  const tail = c.createConicGradient(ang - TRAIL * TAU, cx, cy);
  tail.addColorStop(0, rgba(ink.scan, 0)); tail.addColorStop(TRAIL, rgba(ink.scan, 0.2)); tail.addColorStop(TRAIL + 0.001, rgba(ink.scan, 0)); tail.addColorStop(1, rgba(ink.scan, 0));
  c.fillStyle = tail; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  c.strokeStyle = rgba(ink.scan, 0.85); c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang)); c.stroke();
  c.fillStyle = ink.scan; c.beginPath(); c.arc(cx, cy, 2.5, 0, TAU); c.fill();
  for (const d of RADAR_DOTS) {
    const [x, y] = dotXY(d, cx, cy, R), g = glow(d, ms), col = ink.grade[d.grade], hot = Math.max(0, 1 - sincePass(d, ms) / COOL_MS);
    if (hot > 0) { c.fillStyle = rgba(col, 0.16 * hot); c.beginPath(); c.arc(x, y, d.size + 6, 0, TAU); c.fill(); }
    c.fillStyle = rgba(col, g); c.beginPath(); c.arc(x, y, d.size, 0, TAU); c.fill();
    const p = ring(d, ms);
    if (p >= 0) { c.strokeStyle = rgba(col, 0.8 * (1 - p)); c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, d.size + 3 + 16 * (1 - (1 - p) ** 3), 0, TAU); c.stroke(); }
  }
}

export function RadarHero() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(STILL_MS);
  const calm = useCalm();
  const [stopped, setStopped] = useState(false);
  const [shown, setShown] = useState(false);
  const [cap, setCap] = useState(true); // 정지 그림에서는 한 줄 설명이 늘 보인다

  useEffect(() => { try { setStopped(localStorage.getItem(STOP_KEY) === "1"); } catch { /* 저장이 막힌 브라우저: 기본값(움직임)으로 */ } }, []);
  const toggle = () => setStopped((v) => { try { localStorage.setItem(STOP_KEY, v ? "0" : "1"); } catch { /* 저장 못 해도 이번 화면에서는 멈춘다 */ } return !v; });

  useEffect(() => {
    const el = canvas.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let inView = false;
    const sync = () => setShown(inView && !document.hidden);
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { threshold: 0.3 });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, []);

  const moving = calm === false && !stopped && shown;
  useEffect(() => {
    const el = canvas.current, c = el?.getContext("2d");
    if (!el || !c || calm === null) return;
    const css = getComputedStyle(el), token = (name: string) => css.getPropertyValue(name).trim();
    const ink: Ink = { scan: token("--scan"), line: token("--ring"), grade: RADAR_TOKENS.map(token) };
    let w = 0, h = 0;
    const paint = () => draw(c, w, h, clock.current, ink);
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1), r = el.getBoundingClientRect();
      w = r.width; h = r.height;
      el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    if (!moving) { setCap(calm || captionOn(clock.current)); return () => ro.disconnect(); }
    let raf = 0, last = performance.now(), speed = 0, capNow: boolean | null = null;
    const tick = (now: number) => {
      const dt = Math.min(64, now - last); last = now;
      speed += ((sceneBusy.count > 0 ? 0 : 1) - speed) * 0.06; // 장면이 돌면 부드럽게 서고, 끝나면 부드럽게 다시 돈다
      if (speed > 0.004) { clock.current += dt * speed; paint(); }
      const on = captionOn(clock.current);
      if (on !== capNow) { capNow = on; setCap(on); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [moving, calm]);

  return (
    <figure className="g-radar">
      <div className="g-radar-screen"><canvas ref={canvas} aria-hidden="true" /></div>
      <figcaption>
        <ul className="g-radar-legend" aria-label="점 색 = 등급">{GRADES.map((g) => <li key={g.name}><i style={{ background: `var(${g.token})` }} aria-hidden="true" />{g.name}</li>)}</ul>
        <p className="g-radar-cap" data-on={cap ? "" : undefined}><span className="tag g-tag-danger">{RADAR_CAPTION.tag}</span><span>{RADAR_CAPTION.text}</span></p>
        <p className="g-radar-foot"><span className="tag">그림 · 실제 기술이 아니에요</span>
          {calm === false ? <button type="button" className="btn g-btn-sm" aria-pressed={stopped} onClick={toggle}>움직임 멈추기</button> : null}</p>
      </figcaption>
    </figure>
  );
}
