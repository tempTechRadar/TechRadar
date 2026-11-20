// 캔버스 지도의 상태와 동작(시안 docs/wireframes/radar-ui.js): 보기 설정, 묶음 펼치기·접기, 이 분류만 보기, 카메라, 사이드바 고르기, 그리기 반복.
// React 화면(canvas-map.tsx)은 subscribe로 바뀐 것을 받아 도구 줄·사이드바만 다시 그린다. 캔버스는 여기서 직접 그린다.
// 저장 규칙(design.md 14절): 보기 설정은 주소에 늘 싣고, 이 브라우저 기억은 로그인했을 때만(canSave).
import type { MapNode, TechMapModel } from "@/lib/map/build-map";
import { connected, defaultCollapsed, FIRST_RING, hiddenOf, isUnder, layoutMap, type GroupItem, type Item, type MapLayout, type TechItem } from "@/lib/map/layout";
import { createPhysics } from "@/lib/map/physics";
import { DEFAULT_VIEW, parseView, passes, viewQuery, type ViewConfig } from "@/lib/map/view-config";
import { draw, PULSE_SEC } from "./draw";

const STORE = "techradar.mapView";
const ZMIN = 0.05, ZMAX = 12; // 넓게: 끝없는 판처럼(사용자 11-20)
const clampK = (k: number) => Math.max(ZMIN, Math.min(ZMAX, k));
type Cam = { x: number; y: number; k: number };

export type MapState = {
  W: number; H: number; top: number; right: number; cam: Cam; fly: { from: Cam; to: Cam; t0: number; dur: number } | null; userCam: boolean;
  L: MapLayout; view: ViewConfig; collapsed: Set<string>; hidden: Set<string>; leaving: Map<string, number>; phys: ReturnType<typeof createPhysics>;
  sel: string; focusId: string; lit: Set<string> | null; login: boolean; still: boolean; sweepStart: number; now: number; scopeLabel: string;
  riskRects: { x: number; y: number; list: TechItem[] }[]; hubLabels: { id: string; x: number; y: number; w: number; h: number }[];
  handles: { id: string; x: number; y: number }[]; homeArrow: { x: number; y: number } | null; scale: () => number; base: () => number;
};

/** 이 화면에서 못 쓰는 필터(내 기술이 없는 지도의 "내 기술과 비교군"·없는 프로젝트)는 버린다: 고칠 단추도 없이 지도가 비면 "없음"과 구분할 수 없다 */
function usable(v: ViewConfig, model: TechMapModel, projectIds: string[]): ViewConfig {
  const mine = model.mode === "mine";
  return { ...v, filter: { ...v.filter, mineOnly: mine && v.filter.mineOnly, project: mine && projectIds.includes(v.filter.project) ? v.filter.project : "" } };
}

export function createMapController(opts: { model: TechMapModel; projectIds: string[]; initialQuery: string; canSave: boolean; login: boolean }) {
  const { model, projectIds, canSave } = opts;
  const phys = createPhysics();
  const listeners = new Set<() => void>();
  let version = 0, ctx: CanvasRenderingContext2D | null = null, raf = 0, needDraw = true, last = 0, tick = 0;
  const motion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

  // 브라우저 기억은 여기서 읽지 않는다: 서버가 그린 첫 화면과 달라진다(hydration). 붙인 뒤 restoreSaved로
  const view0 = usable(parseView(opts.initialQuery), model, projectIds);
  const L0 = layoutMap(model, view0);

  const S: MapState = {
    W: 0, H: 0, top: 0, right: 0, cam: { x: 0, y: 0, k: 1 }, fly: null, userCam: false, L: L0, view: view0, collapsed: defaultCollapsed(L0), hidden: new Set(),
    leaving: new Map(), phys, sel: "", focusId: "", lit: null, login: opts.login, still: !!motion?.matches, sweepStart: Infinity, now: 0, scopeLabel: "",
    riskRects: [], hubLabels: [], handles: [], homeArrow: null,
    base() { return Math.min(this.W, this.H - this.top) / (2 * this.L.radius) || 1; }, scale() { return this.cam.k * this.base(); },
  };
  const visible = () => S.L.items.filter((it) => !S.hidden.has(it.id));
  const notify = () => { version++; for (const f of listeners) f(); };
  const dirty = () => { needDraw = true; };

  function saveView() {
    const q = viewQuery(S.view);
    history.replaceState(null, "", q ? `?${q}` : location.pathname);
    if (canSave) try { localStorage.setItem(STORE, q); } catch { /* 기억은 편의일 뿐 */ }
  }

  // ---- 배치
  function rebuild(from: ((it: Item) => [number, number] | null) | null, collapsedIds: string[] | null) {
    S.L = layoutMap(model, S.view);
    S.collapsed = collapsedIds ? new Set(collapsedIds.filter((id) => S.L.byId.has(id))) : defaultCollapsed(S.L);
    S.hidden = hiddenOf(S.L, S.collapsed); S.leaving.clear();
    if (S.sel && !S.L.byId.has(S.sel)) S.sel = "";
    const vis = visible();
    phys.sync(vis, from ? (it) => from(it as Item) : undefined);
    if (from) phys.settleTo(vis.map((it) => [it.id, [it.x, it.y]]), 0.07);
    else for (const it of vis) { const b = phys.B.get(it.id)!; Object.assign(b, { x: it.x, y: it.y, rest: [it.x, it.y] }); }
    const sc = S.view.scope;
    S.scopeLabel = sc.length ? `${sc[sc.length - 1].value} · ${S.L.shown}개` : "";
    setFocus(S.focusId);
  }
  /** 보기 설정 바꾸기. from = 새로 나타나는 것이 튀어나올 자리 */
  function setView(next: ViewConfig, from: [number, number] = [0, 0]) {
    const regroup = next.group.join() !== S.view.group.join() || next.scope !== S.view.scope;
    const scoped = next.scope !== S.view.scope;
    S.view = usable(next, model, projectIds);
    rebuild(() => from, regroup ? null : [...S.collapsed]);
    if (scoped) flyTo(homeCam(), false);
    saveView(); dirty(); notify();
  }
  /** 이 분류만 보기: 그 묶음까지의 경로를 scope에 더하고, 그 안만 원반 전체로 다시 펼친다 */
  function drill(id: string) {
    const g = S.L.byId.get(id);
    if (!g || g.type !== "g") return;
    const chain: ViewConfig["scope"] = [];
    for (let p: Item | undefined = g; p; p = p.parent ? S.L.byId.get(p.parent) : undefined) if (p.type === "g") chain.unshift({ dim: p.dim, value: p.value });
    const b = phys.B.get(id);
    S.sel = "";
    setView({ ...S.view, scope: [...S.view.scope, ...chain] }, b ? [b.x, b.y] : [0, 0]);
  }
  const closing = new Map<string, number>(); // 접히는 중인 묶음 → 숨김 타이머(0.35초 안에 다시 펼치면 취소)
  /** 묶음 펼치기·접기. 펼치면 자식이 묶음 자리에서 튀어나오고, 접으면 묶음으로 빨려 들어간다 */
  function toggle(id: string) {
    const g = S.L.byId.get(id), b = phys.B.get(id);
    if (!g || g.type !== "g" || !b) return;
    const dx = b.x - g.x, dy = b.y - g.y;
    if (S.collapsed.has(id)) {
      S.collapsed.delete(id);
      clearTimeout(closing.get(id)); closing.delete(id);
      const was = S.hidden; S.hidden = hiddenOf(S.L, S.collapsed);
      const born = visible().filter((it) => was.has(it.id) || S.leaving.has(it.id)); // 빨려 들어가던 것도 제자리로
      for (const it of born) S.leaving.delete(it.id);
      phys.sync(visible(), () => [b.x, b.y]);
      phys.settleTo(born.map((it) => [it.id, [it.x + dx, it.y + dy]]), 0.09);
    } else {
      const under = visible().filter((it) => isUnder(S.L, it, id)), end = S.now + 0.35;
      S.collapsed.add(id);
      phys.settleTo(under.map((it) => [it.id, [b.x, b.y]]), 0.15);
      for (const it of under) S.leaving.set(it.id, end);
      closing.set(id, window.setTimeout(() => { closing.delete(id); S.hidden = hiddenOf(S.L, S.collapsed); for (const it of under) S.leaving.delete(it.id); phys.sync(visible()); dirty(); notify(); }, S.still ? 0 : 350));
      if (S.sel && under.some((it) => it.id === S.sel)) S.sel = "";
    }
    dirty(); notify();
  }
  /** 보기 초기화: 맨 처음 화면으로(묶기·색·필터·분류만 보기·펼침·카메라 모두, 사용자 11-20) */
  function resetView() {
    S.sel = "";
    S.view = usable(DEFAULT_VIEW, model, projectIds);
    rebuild((it) => { const p = it.parent ? phys.B.get(it.parent) : null; return p ? [p.x, p.y] : [0, 0]; }, null);
    flyTo(homeCam(), false); saveView(); dirty(); notify();
  }

  // ---- 카메라
  function homeCam(): Cam { // 처음 보기: 보이는 것(접힌 묶음 제외)이 꽉 차게, 도구 줄 밑 가운데에
    const vr = Math.max(FIRST_RING, ...visible().map((it) => Math.hypot(it.x, it.y))) + 40, k = clampK(S.L.radius / vr);
    return { x: 0, y: -S.top / 2 / (k * S.base()), k };
  }
  const toWorld = (sx: number, sy: number): [number, number] => [S.cam.x + (sx - S.W / 2) / S.scale(), S.cam.y + (sy - S.H / 2) / S.scale()];
  const toScreen = (x: number, y: number): [number, number] => [S.W / 2 + (x - S.cam.x) * S.scale(), S.H / 2 + (y - S.cam.y) * S.scale()];
  function flyTo(to: Cam, user = true) { S.userCam = user; if (S.still) { S.cam = { ...to }; S.fly = null; } else S.fly = { from: { ...S.cam }, to, t0: S.now, dur: 0.5 }; dirty(); }
  function zoomAt(sx: number, sy: number, f: number) {
    const [wx, wy] = toWorld(sx, sy);
    S.fly = null; S.userCam = true; S.cam.k = clampK(S.cam.k * f);
    S.cam.x = wx - (sx - S.W / 2) / S.scale(); S.cam.y = wy - (sy - S.H / 2) / S.scale(); dirty();
  }
  function fitVisible() {
    const bs = visible().map((it) => phys.B.get(it.id)).filter((b) => !!b);
    if (!bs.length) return;
    const xs = bs.map((b) => b.x), ys = bs.map((b) => b.y), w = Math.max(80, Math.max(...xs) - Math.min(...xs)), h = Math.max(80, Math.max(...ys) - Math.min(...ys));
    const k = clampK(Math.min((S.W - S.right - 40) / w, (S.H - S.top - 40) / h) / S.base()), sc = k * S.base();
    flyTo({ k, x: (Math.max(...xs) + Math.min(...xs)) / 2 + S.right / 2 / sc, y: (Math.max(...ys) + Math.min(...ys)) / 2 - S.top / 2 / sc });
  }
  /** 고른 것이 사이드바·도구 줄 밑에 가려지면 카메라만 옮긴다(지도 크기는 그대로) */
  function revealItem(id: string) {
    const b = phys.B.get(id); if (!b) return;
    const [x, y] = toScreen(b.x, b.y), sc = S.scale(), cx = (S.W - S.right) / 2, cy = (S.H + S.top) / 2;
    if (x > 30 && x < S.W - S.right - 30 && y > S.top + 30 && y < S.H - 30) return;
    flyTo({ k: S.cam.k, x: b.x - (cx - S.W / 2) / sc, y: b.y - (cy - S.H / 2) / sc });
  }

  // ---- 고르기
  function setFocus(id: string) {
    S.focusId = id && S.L.byId.has(id) ? id : "";
    const on = S.focusId || (S.L.byId.has(S.sel) ? S.sel : "");
    S.lit = on ? connected(S.L, on) : null; dirty();
  }
  function select(id: string, move = true) { if (!S.L.byId.has(id)) return; S.sel = id; setFocus(S.focusId); if (move) revealItem(id); notify(); }
  function unselect() { if (!S.sel) return; S.sel = ""; setFocus(S.focusId); notify(); }
  /** 찾기·비교군 누르기: 필터·분류만 보기에 걸리면 풀고, 접힌 묶음 안이면 펼친 뒤 고른다 */
  function goTo(key: string): string | null {
    const n = model.nodes.find((x) => x.key === key);
    if (!n) return "지도에 올린 기술에서 찾지 못했어요.";
    let msg: string | null = null;
    if (!passes(n, S.view)) {
      msg = S.view.scope.length ? "필터와 분류만 보기를 풀었어요." : "필터를 풀었어요.";
      setView({ ...S.view, filter: { ...DEFAULT_VIEW.filter }, scope: [] });
    }
    for (let p = S.L.byId.get(key)?.parent ?? null; p; p = S.L.byId.get(p)?.parent ?? null) if (S.collapsed.has(p)) toggle(p);
    select(key);
    return msg;
  }

  // ---- 크기·그리기 반복
  function measure(W: number, H: number, top: number, right: number) {
    Object.assign(S, { W, H, top, right });
    const c = ctx?.canvas;
    if (c) { const dpr = window.devicePixelRatio || 1; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); ctx!.setTransform(dpr, 0, 0, dpr, 0, 0); }
    if (!S.userCam && !S.fly) S.cam = homeCam(); // 손대지 않은 카메라는 화면 크기가 바뀌면 처음 보기로 다시 맞춘다
    dirty();
  }
  function frame(ms: number) {
    raf = requestAnimationFrame(frame); // 한 장이 실패해도 다음 장은 그린다
    const now = ms / 1000, dt = Math.min(0.05, now - last || 0.016); last = now; S.now = now; tick++;
    if (S.sweepStart === Infinity) S.sweepStart = now;
    let anim = false;
    if (S.fly) {
      const p = Math.min(1, (now - S.fly.t0) / S.fly.dur), e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2, { from, to } = S.fly;
      S.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k * (to.k / from.k) ** e };
      if (p >= 1) S.fly = null; anim = true;
    }
    if (phys.busy()) { if (S.still) for (let i = 0; i < 40 && phys.busy(); i++) phys.step(1 / 60, now, true); else phys.step(dt, now, false); anim = true; }
    const sweeping = !S.still && now - S.sweepStart < 20;
    const pulsing = !S.still && now - S.sweepStart < PULSE_SEC + 1 && tick % 2 === 0;
    if (ctx && (needDraw || anim || sweeping || S.leaving.size || pulsing)) { draw(ctx, S, now); needDraw = false; }
  }
  function attach(canvas: HTMLCanvasElement) {
    ctx = canvas.getContext("2d");
    const onMotion = () => { S.still = !!motion?.matches; dirty(); };
    motion?.addEventListener("change", onMotion);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); motion?.removeEventListener("change", onMotion); ctx = null; };
  }

  rebuild(null, [...S.collapsed]);
  return {
    S, model, phys, revealItem, toWorld, toScreen, zoomAt, fitVisible, flyTo, homeCam, setView, drill, toggle, resetView, select, unselect, goTo, setFocus, measure, attach, dirty, notify,
    /** 주소에 보기 설정이 없으면 이 브라우저가 기억한 마지막 보기(로그인했을 때만). 붙인 뒤 한 번 */
    restoreSaved() {
      if (opts.initialQuery || !canSave) return;
      try { const saved = localStorage.getItem(STORE); if (saved) setView(parseView(saved)); } catch { /* 저장소를 못 쓰는 브라우저: 기본 보기 */ }
    },
    subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; },
    version: () => version,
    /** 판단을 남긴 뒤 그 기술의 표시만 바꾼다(지도 자리는 그대로) */
    setMark(key: string, mark: MapNode["mark"]) { const n = model.nodes.find((x) => x.key === key); if (n) { n.mark = mark; notify(); } },
    groupMembers(g: GroupItem) { return S.L.items.filter((it): it is TechItem => it.type === "t" && isUnder(S.L, it, g.id)); },
  };
}
export type MapController = ReturnType<typeof createMapController>;
