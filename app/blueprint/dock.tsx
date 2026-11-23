"use client";
// 청사진 스튜디오 하단 패널(P-12e 조각 K, 유니티 Project 창식): 높이 조절 · 접기, 탭 = 기술 | 변경 이력(P-12l 사용자: 불러오기는 위 막대 "불러오기 ▾"로, 검증 탭은 뺌 — 확정 창 "고칠 것" · 서랍 검증 탭은 그대로).
// 기술 = 기술 트리(tech-tree-tab.tsx, S2: 폴더 · 카드 — 관문 · 단계 거르기 · 내 태그 · ?add= 강조 · 끌기 · 넣기는 그쪽).
// AI 점검은 위 막대 "확정 · 내보내기" 창으로 옮김. 그래프는 apply로만 바꾼다.
import { useEffect, useMemo, useRef, useState } from "react";
import { usageOf } from "@/lib/blueprint/stored";
import { logKind, logText, logTime } from "@/lib/blueprint/change-log";
import { TechTreeTab } from "./tech-tree-tab";
import { treeExtrasAction, type TreeExtras } from "./tree-actions";
import type { Issue } from "@/lib/blueprint/validate";
import type { PanelProps } from "./studio-types";
import "./dock.css";

type DockTab = "tech" | "changes";
const TABS: [DockTab, string][] = [["tech", "기술"], ["changes", "변경 이력"]];
/** start = 서버 그림의 높이. 붙은 뒤 화면 높이의 30%로 맞춘다(P-12l 사용자) */
const H = { min: 120, start: 260, step: 24, max: 560, share: 0.3 };
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
type Go = (t: Issue["target"]) => void;
/** listEdit = 넓은 화면의 목록 편집 켜기(탭 줄 끝 작은 링크). 좁은 화면은 늘 목록이라 없음. go = 변경 이력의 이름을 눌러 고르기 */
export function Dock({ listEdit, go, ...p }: PanelProps & { listEdit?: { on: boolean; flip: () => void }; go: Go }) {
  const [tab, setTab] = useState<DockTab>("tech");
  const [open, setOpen] = useState(true);
  // P-12y H4: 처음부터 30%로(붙은 뒤에 줄이면 캔버스 처음 맞춤이 끝난 뒤 캔버스가 작아져 아래 카드 · 섹션이 패널 뒤로 잘렸다).
  // 하단 패널은 판을 읽은 뒤(브라우저에서만) 그려져 하이드레이션 어긋남이 없다
  const [h, setH] = useState(() => (typeof window === "undefined" ? H.start : Math.max(H.min, Math.round(window.innerHeight * H.share))));
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
        <span className="dock-end">
          {listEdit ? <ListEditLink {...listEdit} /> : null}
          <button type="button" className="dock-tab" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "접기 ▼" : "펼치기 ▲"}</button>
        </span>
      </div>
      {open ? (
        <div className="dock-body">
          {tab === "tech" ? <TechTreeTab {...p} usage={usage} extras={extras} /> : <ChangesTab {...p} go={go} />}
        </div>
      ) : null}
    </section>
  );
}

/** 변경 이력 탭(P-12j H4 → P-12v 사용자: 줄글 말고 표): 이 화면에서 판을 바꾼 일을 최근 것부터. 칸 = 번호 · 시각 · 종류 · 내용 · 바로 가기(글에 든 단계 · 기술을 눌러 고름) */
function ChangesTab({ graph, entries = [], go }: PanelProps & { go: Go }) {
  if (!entries.length) return <p className="muted">이 화면에서 아직 판을 바꾸지 않았어요. 새로 고치면 비어요(판은 그대로).</p>;
  const names = [...graph.stages.map((s) => ({ name: s.name, t: { stageId: s.id } })),
    ...graph.stages.flatMap((s) => s.techs.map((x) => ({ name: x.name, t: { stageId: s.id, techId: x.id } })))];
  return (
    <div className="dock-log-wrap">
      <table className="dock-log">
        <caption className="sr-only">이 화면에서 판을 바꾼 일(최근 것부터)</caption>
        <thead><tr><th scope="col">#</th><th scope="col">시각</th><th scope="col">종류</th><th scope="col">내용</th><th scope="col">바로 가기</th></tr></thead>
        <tbody>{entries.map((e, i) => ({ e, n: i + 1 })).reverse().map(({ e, n }) => {
          const hits = names.filter((x) => e.text.includes(x.name)).filter((x, j, a) => a.findIndex((y) => y.name === x.name) === j);
          const kind = logKind(e.text);
          return (
            <tr key={n}>
              <td className="dock-log-n">{n}</td>
              <td className="dock-log-at"><time dateTime={new Date(e.at).toISOString()}>{logTime(e.at)}</time></td>
              <td><span className="dock-log-kind" data-kind={kind}>{kind}</span></td>
              <td className="dock-log-text">{logText(e.text)}</td>
              <td className="dock-log-go">{hits.length ? hits.map((x) => <button key={x.name} type="button" className="bp-link" onClick={() => go(x.t)}>{x.name}</button>) : <span className="muted">—</span>}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
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

/** 목록 편집 켜기 · 끄기: 눈에 덜 띄는 글자 링크. 화면 읽기 이름에 보이는 글 + 무엇인지(목록 = 키보드 · 화면 읽기) */
function ListEditLink({ on, flip }: { on: boolean; flip: () => void }) {
  const text = on ? "그림으로 편집" : "키보드로 편집";
  return <button type="button" className="bp-link" aria-pressed={on} aria-label={`${text} (목록으로 편집: 키보드 · 화면 읽기)`} onClick={flip}>{text}</button>;
}
