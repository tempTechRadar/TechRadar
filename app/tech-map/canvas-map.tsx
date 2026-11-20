"use client";
// 첫 화면 기술 지도(PRD-F23, IA-10, ADR 0026·0027): 캔버스 위 레이더. 시안 docs/wireframes/radar.html을 옮겼다.
// 상태·카메라·그리기는 controller.ts, 손 조작은 input.ts, 이 파일은 도구 줄·사이드바·카드·키보드 목록 같은 화면 조각만.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { MarkStatus, TechMapModel } from "@/lib/map/build-map";
import type { GroupItem, Item, TechItem } from "@/lib/map/layout";
import { DIM_KO, type ViewConfig } from "@/lib/map/view-config";
import { markTech } from "./actions";
import { Crumbs, Legend, Status, SummaryChips, Toolbar } from "./controls";
import { createMapController } from "./controller";
import { attachInput } from "./input";
import { KeyboardList } from "./keyboard-list";
import { markedText } from "./judge";
import { GroupPanel, pathOf, TechPanel } from "./side-panel";
import "./map.css";

type Props = { model: TechMapModel; projects: { id: string; name: string }[]; initialQuery: string; canSave: boolean; login: boolean };
type Tip = { id: string; x: number; y: number };
type Toast = { text: string; undo?: () => void } | null;

export function CanvasMap({ model, projects, initialQuery, canSave, login }: Props) {
  const [ctl] = useState(() => createMapController({ model, projectIds: projects.map((p) => p.id), initialQuery, canSave, login }));
  useSyncExternalStore(ctl.subscribe, ctl.version, ctl.version);
  const S = ctl.S;
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), hud = useRef<HTMLDivElement>(null), side = useRef<HTMLElement>(null);
  const [tip, setTip] = useState<Tip>({ id: "", x: 0, y: 0 });
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const lastFocus = useRef<Element | null>(null);
  // 묶음 카드의 "이 분류만 보기"로 포인터가 옮겨 가는 동안(0.3초) 카드를 남긴다
  const tipTimer = useRef(0), overCard = useRef(false);
  const hover = (id: string, x: number, y: number) => {
    clearTimeout(tipTimer.current);
    if (id) setTip({ id, x, y });
    else tipTimer.current = window.setTimeout(() => { if (!overCard.current) setTip({ id: "", x: 0, y: 0 }); }, 300);
  };
  const canMine = model.mode === "mine";

  const clearTip = () => { clearTimeout(tipTimer.current); overCard.current = false; setTip({ id: "", x: 0, y: 0 }); };
  function open(id: string) {
    clearTip();
    if (!S.sel) lastFocus.current = document.activeElement;
    ctl.select(id);
    requestAnimationFrame(() => document.getElementById("map-side-title")?.focus({ preventScroll: true })); // 초점 때문에 화면이 밀리지 않게
  }
  function close() {
    if (!S.sel) return;
    ctl.unselect();
    if (lastFocus.current instanceof HTMLElement && document.contains(lastFocus.current)) lastFocus.current.focus({ preventScroll: true });
  }
  function say(text: string, undo?: () => void) { setToast({ text, undo }); }
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 2600); return () => clearTimeout(t); }, [toast]);

  // 크기 재기: 도구 줄 아래부터가 지도, 사이드바가 화면 높이만큼이면 그 폭은 비운다
  useEffect(() => {
    const st = stage.current!, cv = canvas.current!;
    const detach = ctl.attach(cv);
    const measure = () => {
      const top = hud.current ? hud.current.getBoundingClientRect().bottom - st.getBoundingClientRect().top + 6 : 0;
      const sd = side.current?.getBoundingClientRect();
      ctl.measure(st.clientWidth, st.clientHeight, top, S.sel && sd && sd.height > st.clientHeight * 0.9 ? sd.width : 0);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(st); if (hud.current) ro.observe(hud.current);
    measure();
    ctl.restoreSaved();
    const want = new URLSearchParams(location.search).get("sel"); // 내 레이더·새 기술의 "지도에서 보기"
    if (want) { // 새로 고침해도 다시 열리지 않게 주소에서 뺀다
      go(want);
      const q = new URLSearchParams(location.search); q.delete("sel");
      history.replaceState(null, "", q.toString() ? `?${q}` : location.pathname);
    }
    const stopInput = attachInput(cv, st, ctl, { hover, open, close });
    // Esc = 사이드바 닫기. 글을 쓰는 칸(보류 이유·찾기)에서는 그 칸의 Esc가 먼저(쓰던 글이 사라지지 않게)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !S.sel || document.querySelector("dialog[open]")) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => { ro.disconnect(); stopInput(); detach(); document.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 컨트롤러는 한 번만 만든다
  }, [ctl]);
  useEffect(() => { // 사이드바가 열리고 닫히면 지도 오른쪽 여백이 바뀐다. 잰 뒤에 고른 것이 사이드바에 가렸는지 본다
    const st = stage.current!, sd = side.current?.getBoundingClientRect();
    ctl.measure(st.clientWidth, st.clientHeight, S.top, S.sel && sd && sd.height > st.clientHeight * 0.9 ? sd.width : 0);
    if (S.sel) ctl.revealItem(S.sel);
  }, [ctl, S, S.sel]);

  const setView = (v: ViewConfig) => { clearTip(); ctl.setView(v); };
  const go = (key: string) => {
    if (!S.sel) lastFocus.current = document.activeElement; // 고르기 전에: 닫을 때 초점을 돌려놓을 곳
    const msg = ctl.goTo(key); if (msg) say(msg); if (S.sel === key) open(key);
  };
  /** 이 분류만 보기: 누른 단추가 사라지니 초점을 경로 칩(나오는 길)으로 */
  const drill = (id: string) => {
    clearTip(); if (S.sel) close(); ctl.drill(id);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".map-crumbs button")?.focus({ preventScroll: true }));
  };
  function find(q: string) {
    const k = q.trim().toLowerCase();
    const cats = [...new Set(model.nodes.flatMap((n) => [`field:${n.attrs.field}`, `sub:${n.attrs.sub}`]))]
      .map((x) => { const i = x.indexOf(":"); return { dim: x.slice(0, i) as "field" | "sub", value: x.slice(i + 1) }; })
      .filter((c) => c.value !== "분류 전" && c.value.toLowerCase().includes(k)).slice(0, 3)
      .map((c) => ({ scope: c, label: `분류 · ${c.value}만 보기`, sub: `${model.nodes.filter((n) => n.attrs[c.dim] === c.value).length}개` }));
    const hits = model.nodes.filter((n) => `${n.name} ${n.oneLiner ?? ""}`.toLowerCase().includes(k))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(k)) - Number(!b.name.toLowerCase().startsWith(k))).slice(0, 8)
      .map((n) => ({ key: n.key, label: n.name, sub: pathOf(n) }));
    return [...cats, ...hits];
  }
  async function mark(item: TechItem, status: MarkStatus | null, reason: string) {
    const n = item.node, prev = n.mark;
    if (!n.techId) return;
    setBusy(true);
    const r = await markTech(n.techId, status, reason).catch(() => ({ ok: false as const, message: "저장하지 못했어요. 다시 시도해 주세요." }));
    setBusy(false);
    if (!r.ok) { say(r.message); return; } // 실패하면 표시는 전 상태 그대로(불변 4)
    ctl.setMark(n.key, status ? { techId: n.techId, status, reason: status === "hold" ? reason.trim() : null } : null);
    if (r.judgedAlerts.length) { say(`${markedText(status)} 판단 대기 알림 ${r.judgedAlerts.length}개도 함께 판단했어요(알림 판단은 되돌릴 수 없어요).`); return; }
    say(markedText(status), async () => { // 판단을 실수로 눌렀을 때
      const back = await markTech(n.techId!, prev?.status ?? null, prev?.reason ?? "").catch(() => null);
      if (!back?.ok) { say(back?.message ?? "되돌리지 못했어요."); return; }
      ctl.setMark(n.key, prev);
      say(back.judgedAlerts.length ? `되돌렸어요. 그사이 온 판단 대기 알림 ${back.judgedAlerts.length}개도 함께 판단됐어요.` : "되돌렸어요.");
    });
  }

  const sel = S.sel ? S.L.byId.get(S.sel) : undefined;
  const compare = useMemo(() => {
    if (!sel || sel.type !== "t") return [];
    return model.edges.filter(([a, b]) => a === sel.id || b === sel.id).map(([a, b]) => {
      const k = a === sel.id ? b : a, item = S.L.byId.get(k) as TechItem | undefined;
      return { item: item ?? null, node: model.nodes.find((n) => n.key === k)!, quote: model.quotes[`${a}|${b}`] ?? null };
    }).filter((c) => c.node);
  }, [sel, model, S.L]);
  const tipItem = tip.id ? S.L.byId.get(tip.id) : undefined;

  return (
    <div className="map-wrap">
      <div ref={stage} className={`map-stage${sel ? " open" : ""}`}>
        <canvas ref={canvas} className="map-canvas" aria-hidden="true" />
        <div ref={hud} className="map-top-hud">
          <Toolbar nodes={model.nodes} view={S.view} projects={projects} canMine={canMine} onView={setView} onReset={() => { close(); clearTip(); ctl.resetView(); say("처음 보기로 돌아왔어요. 묶기·색·필터도 처음으로 돌렸어요."); }} onFind={find} onGo={go} />
          <div className="map-chips"><Crumbs view={S.view} onView={setView} /><SummaryChips nodes={model.nodes} view={S.view} canMine={canMine} onView={setView} /></div>
        </div>
        {tipItem ? <TipCard item={tipItem} x={tip.x} y={tip.y} shut={S.collapsed.has(tipItem.id)}
          onEnter={() => { overCard.current = true; clearTimeout(tipTimer.current); }} onLeave={() => { overCard.current = false; hover("", 0, 0); }}
          onDrill={() => drill(tipItem.id)} /> : null}
        {S.L.shown === 0 ? (
          <div className="map-empty notice notice-empty" role="status"><strong>이 보기에 맞는 기술이 없어요.</strong> 필터를 끄거나 보기 초기화를 눌러 보세요.
            <button type="button" className="btn" onClick={() => ctl.resetView()}>보기 초기화</button></div>
        ) : null}
        <aside ref={side} className="map-side" aria-labelledby="map-side-title" hidden={!sel}>
          <button type="button" className="btn map-close" onClick={close} aria-label="닫기">✕</button>
          {sel?.type === "t" ? <TechPanel item={sel} compare={compare} login={login} busy={busy} onMark={(s, r) => mark(sel, s, r)} onGo={go} /> : null}
          {sel?.type === "g" ? <GroupPanel g={sel} members={ctl.groupMembers(sel)} shut={S.collapsed.has(sel.id)} onDrill={() => drill(sel.id)} onToggle={() => ctl.toggle(sel.id)} onGo={go} /> : null}
        </aside>
        <p className="map-toast" role="status" aria-live="polite">{toast?.text}{toast?.undo ? <button type="button" className="btn" onClick={() => { const u = toast.undo!; setToast(null); u(); }}>되돌리기</button> : null}</p>
      </div>
      <Legend L={S.L} view={S.view} onView={setView} />
      <Status L={S.L} collapsed={S.collapsed.size} nodes={model.nodes} view={S.view} />
      <KeyboardList L={S.L} collapsed={S.collapsed} onToggle={(id) => ctl.toggle(id)} onOpen={open} onDrill={drill} onFocus={(id) => ctl.setFocus(id)} />
    </div>
  );
}

/** 올리기 카드: 묶음은 개수·위험과 "이 분류만 보기" 단추, 기술은 경로·보안 */
function TipCard({ item, x, y, shut, onDrill, onEnter, onLeave }: { item: Item; x: number; y: number; shut: boolean; onDrill: () => void; onEnter: () => void; onLeave: () => void }) {
  const style = { left: Math.max(8, x + 16), top: Math.max(8, y + 12) };
  if (item.type === "g") {
    const g = item as GroupItem;
    return (
      <div className="map-card map-card-live" style={style} onPointerEnter={onEnter} onPointerLeave={onLeave}>
        <b>{g.value}</b><span className="muted">{DIM_KO[g.dim]} · {g.count}개{g.danger ? ` · 위험 ${g.danger}` : ""}{g.caution ? ` · 주의 ${g.caution}` : ""}{g.err ? ` · 수집 오류 ${g.err}` : ""}</span>
        <span className="muted">누르면 목록 · 오른쪽 아래 {shut ? "+로 펼쳐요" : "−로 접어요"} · 끌면 함께 옮겨요</span>
        <button type="button" className="btn" onClick={onDrill}>이 분류만 보기</button>
      </div>
    );
  }
  const n = (item as TechItem).node;
  return (
    <div className="map-card" style={style} role="tooltip">
      <b>{n.name}{n.isNew ? " · NEW" : ""}</b><span className="muted">{pathOf(n)}</span>
      {n.grade === "danger" ? <span>✕ 보안 위험</span> : n.grade === "caution" ? <span>! 보안 주의</span> : null}
      {n.collectErrorKind ? <span>수집 오류(지난 값 표시)</span> : null}
      <span className="muted">누르면 자세히 · 끌면 이웃이 따라와요</span>
    </div>
  );
}
