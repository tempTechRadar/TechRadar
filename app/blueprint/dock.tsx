"use client";
// 청사진 스튜디오 하단 패널(P-12e 조각 K, 유니티식): 높이 조절 · 접기, 탭 = 기술 | 불러오기(P-12h S1: 단계 칸이 없어져 탭을 둘로).
// 기술 = 기술 트리(tech-tree-tab.tsx, S2: 폴더 · 카드 — 관문 · 단계 거르기 · 내 태그 · ?add= 강조 · 끌기 · 넣기는 그쪽). 불러오기 = 템플릿(template-tab) · 내 이력 · 질문으로 틀 만들기.
// AI 점검은 위 막대 "확정 · 내보내기" 창으로 옮김. 그래프는 apply로만 바꾼다.
import { useEffect, useMemo, useRef, useState } from "react";
import { toBoard, usageOf, HISTORY_LIMIT, type BlueprintRecord, type TechUsage } from "@/lib/blueprint/stored";
import { fromV1 } from "@/lib/blueprint/graph";
import { TechTreeTab } from "./tech-tree-tab";
import { treeExtrasAction, type TreeExtras } from "./tree-actions";
import { TemplateTab } from "./template-tab";
import type { PanelProps } from "./studio-types";
import "./dock.css";

type Tab = "tech" | "load";
const TABS: [Tab, string][] = [["tech", "기술"], ["load", "불러오기"]];
const H = { min: 120, start: 260, step: 24, max: 560 };
/** 높이 한도 = 화면 높이의 70%. 서버는 화면을 몰라 기본값으로 그리고, 붙은 뒤(useEffect) 맞춘다(하이드레이션 어긋남 없게) */
function useMaxH() {
  const [max, setMax] = useState(H.max);
  useEffect(() => {
    const fit = () => setMax(Math.max(H.min, Math.round(window.innerHeight * 0.7)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return max;
}
const when = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

export function Dock(p: PanelProps) {
  const [tab, setTab] = useState<Tab>("tech");
  const [open, setOpen] = useState(true);
  const [h, setH] = useState(H.start);
  const usage = useMemo(() => usageOf(p.history ?? []), [p.history]);
  const [extras, setExtras] = useState<TreeExtras | undefined>(undefined);
  // 기술 트리의 관심 · 보류: 탭을 바꾸거나 접어도 다시 읽지 않고, 서랍을 다시 읽을 때(고르기 뒤 새로 고침)만 다시 읽는다
  useEffect(() => { if (!p.guest) treeExtrasAction().then(setExtras, () => setExtras({ kind: "error" })); }, [p.guest, p.pool]);
  const max = useMaxH();
  const clamp = (v: number) => Math.min(max, Math.max(H.min, Math.round(v)));
  return (
    <section className="dock" aria-label="하단 패널" style={{ height: open ? Math.min(h, max) : undefined }}>
      {open ? <Resizer h={Math.min(h, max)} max={max} onH={(v) => setH(clamp(v))} /> : null}
      <div className="dock-bar">
        <div className="dock-tabs" role="group" aria-label="하단 패널 보기">
          {TABS.map(([k, name]) => (
            <button key={k} type="button" className="dock-tab" aria-pressed={tab === k} onClick={() => { setTab(k); setOpen(true); }}>
              {name}
            </button>
          ))}
        </div>
        <button type="button" className="dock-tab" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "접기 ▼" : "펼치기 ▲"}</button>
      </div>
      {open ? (
        <div className="dock-body">
          {tab === "tech" ? <TechTreeTab {...p} usage={usage} extras={extras} /> : <LoadTab {...p} usage={usage} />}
        </div>
      ) : null}
    </section>
  );
}

/** 높이 조절 막대: 끌거나(포인터) ↑ ↓ 키로 24px씩 */
function Resizer({ h, max, onH }: { h: number; max: number; onH: (v: number) => void }) {
  const from = useRef<{ y: number; h: number } | null>(null);
  return (
    <div className="dock-resize" role="separator" aria-orientation="horizontal" aria-label="하단 패널 높이" tabIndex={0}
      aria-valuenow={h} aria-valuemin={H.min} aria-valuemax={max}
      onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onH(h + (e.key === "ArrowUp" ? H.step : -H.step)); } }}
      onPointerDown={(e) => { from.current = { y: e.clientY, h }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (from.current) onH(from.current.h + from.current.y - e.clientY); }}
      onPointerUp={() => { from.current = null; }} onPointerCancel={() => { from.current = null; }} />
  );
}

/** 불러오기 탭: 질문으로 틀 만들기(손님도 됨, 이 브라우저 판) · 템플릿 · 내 이력(로그인) */
function LoadTab(p: PanelProps & { usage: Map<string, TechUsage> }) {
  return (
    <>
      <p className="dock-row"><button type="button" className="btn btn-sm" onClick={p.onAsk}>질문으로 틀 만들기</button><span className="muted">몇 가지 물음에 답하면 단계 틀을 만들어 줘요.</span></p>
      {p.guest ? <p className="notice" role="status">로그인하면 템플릿을 저장 · 공개하고, 확정한 청사진을 불러올 수 있어요. <a href={`/login?next=${encodeURIComponent("/blueprint")}`}>로그인</a> · 지금 판은 이 브라우저에 그대로 있어요.</p> : <>
        <h3 className="dock-h">템플릿</h3>
        <TemplateTab {...p} />
        <h3 className="dock-h">내 이력{p.history ? ` ${p.history.length}` : ""}</h3>
        <HistTab {...p} />
      </>}
    </>
  );
}

function HistTab({ graph, history, apply, usage }: PanelProps & { usage: Map<string, TechUsage> }) {
  if (history === null) return <p className="notice notice-error" role="alert">내 이력을 불러오지 못했어요. 확정한 게 없다는 뜻이 아니에요. 판 만들기는 그대로 쓸 수 있어요.</p>;
  if (!history.length) return <p className="muted">아직 확정한 청사진이 없어요. 위 "확정 · 내보내기"에서 확정하면 여기에 쌓여요.</p>;
  // 확인 창 대신 되돌리기(studio가 50단계 쌓음): 지금 판이 있으면 알림에서 되돌릴 수 있다고 말한다
  // 판과 이름을 한 되돌리기 칸에(apply의 name): 되돌리면 이름도 돌아가고, 시작 템플릿 표시도 studio가 지운다
  const load = (h: BlueprintRecord) => apply(fromV1(toBoard(h.board)), `"${h.name}"을(를) 불러왔어요.${graph.stages.length ? " 전 판은 되돌리기로 돌아와요." : ""}`, h.name);
  const names = new Map(history.flatMap((h) => h.board.flat().flatMap((s) => s.techs.map((t) => [t.id, t.name] as const))));
  const top = [...usage].sort((a, b) => b[1].n - a[1].n).slice(0, 15);
  return (
    <div className="dock-cols">
      <section aria-labelledby="dock-hist">
        <h3 id="dock-hist" className="dock-h">확정한 청사진 <span className="muted">{history.length}</span></h3>
        {history.length >= HISTORY_LIMIT ? <p className="muted">최근 {HISTORY_LIMIT}개만 보여요. 쓴 횟수도 이 안에서 셌어요.</p> : null}
        <ul className="dock-techs">{history.map((h) => (
          <li key={h.id} className="dock-tech">
            <span><b>{h.name}</b><span className="muted"> · {h.projectName ?? "프로젝트 없음"} · {when.format(new Date(h.createdAt))}</span></span>
            <span className="muted">{h.board.map((c) => c.map((s) => s.name).join(" + ")).join(" → ")}</span>
            <button type="button" className="btn btn-sm" onClick={() => load(h)}>불러오기</button>
          </li>
        ))}</ul>
      </section>
      <section aria-labelledby="dock-top">
        <h3 id="dock-top" className="dock-h">자주 쓴 기술</h3>
        {top.length ? <ul className="dock-techs">{top.map(([id, x]) => (
          <li key={id} className="dock-tech"><span><b>{names.get(id) ?? "이름 모름"}</b><span className="muted"> · {x.n}번 · 프로젝트 {x.projects}개 · {x.stages.join(", ")}</span></span></li>
        ))}</ul> : <p className="muted">확정한 청사진에 넣은 기술이 아직 없어요.</p>}
      </section>
    </div>
  );
}
