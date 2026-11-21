"use client";
// 첫 화면 기술 지도(PRD-F23, IA-10, ADR 0026·0027): 캔버스 위 레이더. 시안 docs/wireframes/radar.html을 옮겼다.
// 상태·카메라·그리기는 controller.ts, 손 조작은 input.ts, 이 파일은 도구 줄·사이드바·카드·키보드 목록 같은 화면 조각만.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { UNSORTED, type MarkStatus, type TechMapModel } from "@/lib/map/build-map";
import type { GroupItem, Item, TechItem } from "@/lib/map/layout";
import { DIM_KO, type ViewConfig } from "@/lib/map/view-config";
import { saveMarkWithToast, ToastLine, useToast } from "../undo-toast";
import { Crumbs, Legend, QuickChips, Status, Toolbar } from "./controls";
import { createMapController } from "./controller";
import { attachInput } from "./input";
import { markedText } from "./judge";
import { RadarSettings } from "./radar-settings";
import { describeKo } from "@/lib/map/describe";
import { GroupPanel, pathOf, TechPanel } from "./side-panel";
import { ViewTabs } from "./view-tabs";
import { READY_MAP } from "@/lib/map/ready-gate";
import "./map.css";

/** top = 지도 위에 뜨는 첫 줄(판단 대기 · 최근 변경 · 로그인 유도 등, 페이지가 정함) */
/** who = 로그인한 사람 id(이 브라우저에 저장한 보기 묶음을 사람마다 따로) */
type Props = { model: TechMapModel; projects: { id: string; name: string }[]; initialQuery: string; canSave: boolean; login: boolean; who?: string; top?: ReactNode };
type Tip = { id: string; x: number; y: number };

export function CanvasMap({ model, projects, initialQuery, canSave, login, who, top }: Props) {
  const [ctl] = useState(() => createMapController({ model, projectIds: projects.map((p) => p.id), initialQuery, canSave, login }));
  useSyncExternalStore(ctl.subscribe, ctl.version, ctl.version);
  const S = ctl.S;
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), hud = useRef<HTMLDivElement>(null), side = useRef<HTMLElement>(null), dock = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>({ id: "", x: 0, y: 0 });
  const { toast, say, clear: clearToast } = useToast();
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
    if (S.sel !== id) side.current?.scrollTo(0, 0); // 패널은 닫혀도 그려져 있어 지난 기술의 스크롤 자리가 남는다
    ctl.select(id);
    requestAnimationFrame(() => document.getElementById("map-side-title")?.focus({ preventScroll: true })); // 초점 때문에 화면이 밀리지 않게
  }
  function close() {
    if (!S.sel) return;
    ctl.unselect();
    if (lastFocus.current instanceof HTMLElement && document.contains(lastFocus.current)) lastFocus.current.focus({ preventScroll: true });
  }

  // 범례 · 상태 줄 높이(알림 말풍선은 빼고 잰다: 말풍선이 뜰 때마다 지도가 다시 맞춰지지 않게)
  const dockHeight = () => { const first = dock.current?.querySelector(".map-legend, .map-status"); return first && stage.current ? stage.current.getBoundingClientRect().bottom - first.getBoundingClientRect().top : 0; };
  // 크기 재기: 도구 줄 아래부터 범례 · 상태 줄 위까지가 지도, 사이드바가 화면 높이만큼이면 그 폭은 비운다(가려진 것을 꺼낼 때만 씀).
  // 사이드바는 도구 줄 · 범례 위로 덮기만 해서(좁히지 않음) 열고 닫아도 위아래 여백 · 배율이 그대로다(11-21 사용자: 지도를 밀지 않게)
  const insets = (st: HTMLDivElement) => ({
    top: hud.current ? hud.current.getBoundingClientRect().bottom - st.getBoundingClientRect().top + 6 : 0,
    bottom: dockHeight(),
    right: (() => { const sd = side.current?.getBoundingClientRect(); return S.sel && sd && sd.height > st.clientHeight * 0.9 ? sd.width : 0; })(),
  });
  useEffect(() => {
    const st = stage.current!, cv = canvas.current!;
    const detach = ctl.attach(cv);
    requestAnimationFrame(() => window.dispatchEvent(new Event(READY_MAP))); // 첫 장을 그린 뒤 첫 화면 덮개의 "지도 보기"를 켠다
    const measure = () => { const m = insets(st); ctl.measure(st.clientWidth, st.clientHeight, m.top, m.right, m.bottom); };
    const ro = new ResizeObserver(measure);
    ro.observe(st); if (hud.current) ro.observe(hud.current); if (dock.current) ro.observe(dock.current);
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
    const st = stage.current!, m = insets(st);
    ctl.measure(st.clientWidth, st.clientHeight, m.top, m.right, m.bottom);
    if (S.sel) ctl.revealItem(S.sel);
  }, [ctl, S, S.sel]);

  const setView = (v: ViewConfig) => { clearTip(); ctl.setView(v); };
  const replay = () => { clearTip(); if (S.sel) close(); const n = ctl.replayArrivals(); say(n ? `이번 주에 들어온 ${n}개예요. 이번 주 칩을 다시 누르면 전체로 돌아가요.` : "이번 주에 새로 들어온 기술이 없어요."); };
  const go = (key: string) => {
    if (!S.sel) lastFocus.current = document.activeElement; // 고르기 전에: 닫을 때 초점을 돌려놓을 곳
    if (S.sel !== key) side.current?.scrollTo(0, 0);
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
      .filter((c) => c.value !== UNSORTED && c.value.toLowerCase().includes(k)).slice(0, 3)
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
    await saveMarkWithToast({ techId: n.techId, status, reason, prev, text: markedText(status), say,
      onSaved: (restored) => ctl.setMark(n.key, restored ? prev : status ? { techId: n.techId!, status, reason: status === "hold" ? reason.trim() : null } : null) });
    setBusy(false);
  }

  const sel = S.sel ? S.L.byId.get(S.sel) : undefined;
  // 사이드바가 빠져나가는 동안(0.22초)에도 마지막 내용을 둔다: 바로 비우면 빈 판이 미끄러져 나간다. 열림 여부는 sel로만
  const [lastSel, setLastSel] = useState(sel);
  if (sel && sel !== lastSel) setLastSel(sel);
  const shown = sel ?? lastSel;
  const compare = useMemo(() => {
    const sel = shown;
    if (!sel || sel.type !== "t") return [];
    return model.edges.filter(([a, b]) => a === sel.id || b === sel.id).map(([a, b]) => {
      const k = a === sel.id ? b : a, item = S.L.byId.get(k) as TechItem | undefined;
      return { item: item ?? null, node: model.nodes.find((n) => n.key === k)!, quote: model.quotes[`${a}|${b}`] ?? null };
    }).filter((c) => c.node);
  }, [shown, model, S.L]);
  const tipItem = tip.id ? S.L.byId.get(tip.id) : undefined;

  return (
    <div className="map-wrap">
      <div ref={stage} className={`map-stage${sel ? " open" : ""}`}>
        <canvas ref={canvas} className="map-canvas" aria-hidden="true" />
        <div ref={hud} className="map-top-hud">
          {top ? <div className="map-top">{top}</div> : null}
          <Toolbar nodes={model.nodes} view={S.view} projects={projects} canMine={canMine} login={login} tagsFailed={model.tagsFailed} onView={setView} onReset={() => { close(); clearTip(); ctl.resetView(); say("처음 보기로 돌아왔어요. 묶기·색·필터도 처음으로 돌렸어요."); }} onFind={find} onGo={go} />
          <ViewTabs current={ctl.query()} queryOf={ctl.queryOf} countOf={ctl.countOf} apply={(q) => { clearTip(); ctl.applyQuery(q); }} who={login ? who : undefined} canMine={canMine} say={say} />
          <div className="map-chips"><Crumbs view={S.view} onView={setView} /><QuickChips nodes={model.nodes} view={S.view} canMine={canMine} login={login} trendFailed={model.trendFailed} onView={setView} onReplay={replay} /></div>
        </div>
        {tipItem ? <TipCard item={tipItem} x={tip.x} y={tip.y} shut={S.collapsed.has(tipItem.id)}
          onEnter={() => { overCard.current = true; clearTimeout(tipTimer.current); }} onLeave={() => { overCard.current = false; hover("", 0, 0); }}
          onDrill={() => drill(tipItem.id)} /> : null}
        {S.L.shown === 0 ? (
          <div className="map-empty notice notice-empty" role="status"><strong>이 보기에 맞는 기술이 없어요.</strong> 필터를 끄거나 보기 초기화를 눌러 보세요.
            <button type="button" className="btn" onClick={() => ctl.resetView()}>보기 초기화</button></div>
        ) : null}
        <aside ref={side} className="map-side" aria-labelledby="map-side-title" data-open={sel ? "" : undefined} inert={!sel}>
          <button type="button" className="btn map-close" onClick={close} aria-label="닫기">✕</button>
          {shown?.type === "t" ? <TechPanel item={shown} compare={compare} login={login} busy={busy} onMark={(s, r) => mark(shown, s, r)} onGo={go} onTags={(tags) => ctl.setTags(shown.node.key, tags)} /> : null}
          {shown?.type === "g" ? <GroupPanel g={shown} members={ctl.groupMembers(shown)} shut={S.collapsed.has(shown.id)} onDrill={() => drill(shown.id)} onToggle={() => ctl.toggle(shown.id)} onGo={go} /> : null}
        </aside>
        {/* 범례 · 상태는 지도 아래쪽에 뜬다(시안 radar.html의 dock). 알림 말풍선은 그 바로 위에 쌓여 범례를 덮지 않는다 */}
        <div ref={dock} className="map-dock">
          <RadarSettings motion={S.motion} tune={S.tune} still={S.still} onMotion={ctl.setMotion} onTune={ctl.setTune} />
          <ToastLine toast={toast} clear={clearToast} className="map-toast" />
          <Legend L={S.L} view={S.view} onView={setView} />
          <Status L={S.L} collapsed={S.collapsed.size} nodes={model.nodes} view={S.view} />
        </div>
      </div>
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
  const [what, facts] = describeKo(n); // 한국어 한 줄(11-21 사용자: 영어 소개는 빼고)
  return (
    <div className="map-card" style={style} role="tooltip">
      <b>{n.name}{n.isNew ? " · NEW" : ""}</b><span>{what}</span>
      {facts ? <span className="muted">{facts}</span> : null}
      {n.collectErrorKind ? <span>수집 오류(지난 값 표시)</span> : null}
      <span className="muted">누르면 자세히 · 끌면 이웃이 따라와요</span>
    </div>
  );
}
