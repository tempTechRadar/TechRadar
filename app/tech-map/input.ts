// 지도의 손 조작(시안 docs/wireframes/radar-input.js): 끌기(물리) · 누르기(사이드바) · 묶음 옆 +/− = 펼치기/접기 · 빈 곳 끌어 이동 · 휠·꼬집기 확대 ·
// 빈 곳 두 번 누르기 = 보이는 것 맞추기. 스페이스를 누른 채 끌면 피그마처럼 손 모양으로 화면만 이동(점과 닿아도 반응 없음). 단축키는 두지 않는다(사용자 11-20).
import { isUnder, type Item } from "@/lib/map/layout";
import { dotRadius, hubRadius } from "./draw";
import type { MapController } from "./controller";

export type InputHooks = {
  /** 올린 것이 바뀌거나 움직임: 카드·"이 분류만 보기" 단추 자리 */ hover: (id: string, x: number, y: number) => void;
  open: (id: string) => void; close: () => void;
};

export function attachInput(canvas: HTMLCanvasElement, stage: HTMLElement, ctl: MapController, hooks: InputHooks) {
  const { S, phys } = ctl;
  const pts = new Map<number, [number, number]>();
  let hand = false, hoverId = "", pinch: { d: number; m: [number, number] } | null = null;
  type Down = { mode: "pan" | "item" | "handle" | "label" | "risk" | "home"; x: number; y: number; id?: string; cam?: typeof S.cam; click?: boolean; panning?: boolean; drag?: boolean; off?: [number, number]; risk?: (typeof S.riskRects)[number] };
  let down: Down | null = null;
  const local = (e: PointerEvent | MouseEvent | WheelEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  function hit(sx: number, sy: number): Item | null {
    let best: Item | null = null, bd = Infinity;
    const sc = S.scale();
    for (const it of S.L.items) {
      if (S.hidden.has(it.id) || S.leaving.has(it.id)) continue;
      const b = phys.B.get(it.id); if (!b) continue;
      const [x, y] = ctl.toScreen(b.x, b.y), rp = it.type === "g" ? hubRadius(it, sc) + 3 : dotRadius(it, sc) + 5, d = Math.hypot(x - sx, y - sy);
      if (d < Math.max(rp, 10) && d - rp < bd) { bd = d - rp; best = it; }
    }
    return best;
  }
  const labelAt = (sx: number, sy: number) => S.hubLabels.find((l) => sx >= l.x && sx <= l.x + l.w && sy >= l.y && sy <= l.y + l.h);
  const riskAt = (sx: number, sy: number) => S.riskRects.find((r) => Math.hypot(r.x - sx, r.y - sy) < 18);
  const handleAt = (sx: number, sy: number) => S.handles.find((h) => Math.hypot(h.x - sx, h.y - sy) < 11);
  function hover(id: string, sx: number, sy: number) {
    if (hoverId !== id) { hoverId = id; ctl.setFocus(id); }
    canvas.classList.toggle("on-item", !!id);
    hooks.hover(id, sx, sy);
  }

  // 끌기 시작: 묶음이면 그 아래 전체를 단단히(대형 유지), 기술이면 이웃(위 묶음)이 줄에 끌려온다
  function startDrag(d: Down) {
    const it = S.L.byId.get(d.id!)!;
    const team = it.type === "g" ? new Set(S.L.items.filter((x) => !S.hidden.has(x.id) && isUnder(S.L, x, it.id)).map((x) => x.id)) : null;
    const pairs = S.L.items.filter((x) => x.parent && !S.hidden.has(x.id)).map((x) => [x.parent!, x.id] as [string, string]);
    phys.kick(d.id!, team, pairs);
    const b = phys.B.get(d.id!)!, [wx, wy] = ctl.toWorld(d.x, d.y);
    d.off = [b.x - wx, b.y - wy]; d.drag = true;
    canvas.classList.add("dragging"); hover("", 0, 0);
  }

  function onDown(e: PointerEvent) {
    if (ctl.finishIntro()) return; // 처음 연출 중이면 이 누르기는 연출을 끝내는 데만(카메라가 바뀌어 누른 점이 어긋나지 않게, 시안처럼)
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    pts.set(e.pointerId, [x, y]);
    if (pts.size === 2) { // 두 손가락: 끌기를 멈추고 꼬집기
      if (down?.drag) phys.release();
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; down = null; return;
    }
    const cam = { ...S.cam };
    if (hand) { down = { mode: "pan", x, y, cam }; stage.classList.add("panning"); return; }
    if (S.homeArrow && Math.hypot(S.homeArrow.x - x, S.homeArrow.y - y) < 40) { down = { mode: "home", x, y }; return; }
    const r = riskAt(x, y), hd = handleAt(x, y), it = hit(x, y), lab = labelAt(x, y);
    down = r ? { mode: "risk", risk: r, x, y } : hd ? { mode: "handle", id: hd.id, x, y } : it ? { mode: "item", id: it.id, x, y } : lab ? { mode: "label", id: lab.id, x, y } : { mode: "pan", x, y, cam, click: true };
  }
  function onMove(e: PointerEvent) {
    const [x, y] = local(e);
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [x, y]);
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], sc = S.scale();
      S.cam.x -= (m[0] - pinch.m[0]) / sc; S.cam.y -= (m[1] - pinch.m[1]) / sc;
      ctl.zoomAt(m[0], m[1], d / pinch.d); pinch = { d, m }; return;
    }
    if (!down) {
      if (hand) { hover("", 0, 0); return; }
      const hd = handleAt(x, y), it = !hd && hit(x, y), lab = !hd && !it && labelAt(x, y);
      hover(hd ? hd.id : it ? it.id : lab ? lab.id : "", x, y); return;
    }
    const moved = Math.hypot(x - down.x, y - down.y) > 4;
    if (down.mode === "pan" && (moved || down.panning)) {
      down.panning = true; S.fly = null; S.userCam = true;
      const sc = S.scale(); S.cam.x = down.cam!.x - (x - down.x) / sc; S.cam.y = down.cam!.y - (y - down.y) / sc; ctl.dirty();
    } else if (down.mode === "item") {
      if (!down.drag && moved) startDrag(down);
      if (down.drag) { const [wx, wy] = ctl.toWorld(x, y); phys.drag(wx + down.off![0], wy + down.off![1]); }
    }
  }
  function endPointer(e: PointerEvent, cancel: boolean) {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    stage.classList.remove("panning"); canvas.classList.remove("dragging");
    const d = down; down = null;
    if (!d) return;
    if (d.drag) { phys.release(); return; }
    if (cancel || d.panning) return;
    if (d.mode === "home") ctl.flyTo(ctl.homeCam(), false);
    else if (d.mode === "risk") { const worst = d.risk!.list.find((it) => it.node.grade === "danger") ?? d.risk!.list[0]; hooks.open(worst.id); }
    else if (d.mode === "handle") ctl.toggle(d.id!);
    else if (d.mode === "label" || d.mode === "item") hooks.open(d.id!); // 묶음도 누르면 사이드바(실수로 접히지 않게)
    else if (d.click) hooks.close();
  }
  const onUp = (e: PointerEvent) => endPointer(e, false);
  const onCancel = (e: PointerEvent) => endPointer(e, true);
  const onLeave = () => { if (!down) hover("", 0, 0); };
  const onDbl = (e: MouseEvent) => { const [x, y] = local(e); if (!hit(x, y)) ctl.fitVisible(); };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); if (ctl.finishIntro()) return; const [x, y] = local(e); ctl.zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); };

  // 스페이스 = 손 모드(입력 칸·단추에 초점이 있으면 원래 동작 그대로)
  const typing = (el: EventTarget | null) => el instanceof Element && !!el.closest("input, select, textarea, button, a, summary, [contenteditable], dialog");
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" && !typing(e.target)) { e.preventDefault(); if (!hand) { hand = true; stage.classList.add("hand"); hover("", 0, 0); } }
  };
  const handOff = () => { hand = false; stage.classList.remove("hand", "panning"); };
  const onKeyUp = (e: KeyboardEvent) => { if (e.code === "Space") handOff(); };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("dblclick", onDbl);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", handOff);
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onCancel);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("dblclick", onDbl);
    canvas.removeEventListener("wheel", onWheel);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", handOff);
  };
}
