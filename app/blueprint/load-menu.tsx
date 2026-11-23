"use client";
// 위 막대 "불러오기 ▾"(P-12l, 사용자): 위 = 기본 템플릿 3개(누르면 바로, 되돌리기 한 칸), 아래 = 질문으로 틀 만들기 · 내 청사진 · 템플릿(창).
// 하단 패널 불러오기 탭을 옮겨 왔다. 팝오버는 "＋ 단계"와 같은 모양(studio-addpop): Esc로 닫고 단추로 초점, ↑ ↓ · Tab으로 이동, 밖으로 나가면 닫힘.
import { useEffect, useMemo, useRef, useState } from "react";
import { fromNames } from "@/lib/blueprint/board";
import { fromV1 } from "@/lib/blueprint/graph";
import { TEMPLATES } from "@/lib/blueprint/knowledge";
import { toBoard, usageOf, HISTORY_LIMIT, type BlueprintRecord, type TechUsage } from "@/lib/blueprint/stored";
import { Dialog } from "../c-dialog";
import { TemplateTab } from "./template-tab";
import type { PanelProps } from "./studio-types";

/** 확정 이력 하나를 판으로: [판, 알림 글]. 이력 창 "불러오기"와 주소 ?bp=(studio)가 같이 쓴다 */
export const fromRecord = (h: BlueprintRecord, hadStages: boolean) =>
  [h.graph ?? fromV1(toBoard(h.board)), `"${h.name}"을(를) 불러왔어요.${hadStages ? " 전 판은 되돌리기로 돌아와요." : ""}`] as const;

const when = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

/** blocked = 막힌 이유(읽기 전용 등, 위 막대 gate와 같은 규칙: 누르면 이유를 말함). ask = 밖(빈 판 카드)에서 열어 달라는 횟수 */
export function LoadMenu({ blocked, ask = 0, ...p }: PanelProps & { blocked: string | null; ask?: number }) {
  const [open, setOpen] = useState(false), [more, setMore] = useState(false);
  useEffect(() => { if (ask) setOpen(true); }, [ask]);
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  const shown = open && !blocked;
  useEffect(() => { if (shown) box.current?.querySelector("button")?.focus(); }, [shown]);
  const close = () => { btn.current?.focus(); setOpen(false); }; // 칸이 사라지기 전에 단추로(초점이 body로 떨어지지 않게)
  const choose = (run: () => void) => () => { close(); run(); };
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = [...box.current!.querySelectorAll("button")], i = all.indexOf(document.activeElement as HTMLButtonElement);
    all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length].focus();
  }
  return (
    <span className="studio-addwrap">
      <button ref={btn} type="button" className="btn" aria-expanded={shown} aria-disabled={blocked ? true : undefined} title={blocked ?? undefined}
        onClick={() => (blocked ? p.say(blocked) : setOpen(!open))}>불러오기 ▾</button>
      {shown ? (
        <div ref={box} className="studio-addpop studio-loadpop" role="group" aria-label="불러오기" onKeyDown={onKey}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null) && e.relatedTarget !== btn.current) setOpen(false); }}>
          {TEMPLATES.map((t) => (
            <button key={t.name} type="button" className="btn" onClick={choose(() => p.apply(fromV1(fromNames(t.cols)), `"${t.name}"을(를) 불러왔어요. 전 판은 되돌리기로 돌아와요.`, t.name))}>
              <b>{t.name}</b><span className="muted">{t.desc}</span>
            </button>
          ))}
          <hr />
          <button type="button" className="btn" onClick={choose(p.onAsk)}>질문으로 틀 만들기</button>
          <button type="button" className="btn" onClick={choose(() => setMore(true))}>내 청사진 · 템플릿…</button>
        </div>
      ) : null}
      {more ? <Dialog title="내 청사진 · 템플릿" onClose={() => setMore(false)}>
        {/* 이력을 불러오면 창을 닫아 판이 보이게 */}
        <LoadTab {...p} apply={(...a) => { setMore(false); p.apply(...a); }} />
      </Dialog> : null}
    </span>
  );
}

/** 템플릿(저장 · 공개 · 시작) · 내 이력(로그인). 손님은 로그인 안내 */
function LoadTab(p: PanelProps) {
  const usage = useMemo(() => usageOf(p.history ?? []), [p.history]);
  if (p.guest) return <p className="notice" role="status">로그인하면 템플릿을 저장 · 공개하고, 확정한 청사진을 불러올 수 있어요. <a href={`/login?next=${encodeURIComponent("/blueprint")}`}>로그인</a> · 지금 판은 이 브라우저에 그대로 있어요.</p>;
  return (
    <>
      <h3 className="dock-h">템플릿</h3>
      <TemplateTab {...p} />
      <h3 className="dock-h">내 이력{p.history ? ` ${p.history.length}` : ""}</h3>
      <HistTab {...p} usage={usage} />
    </>
  );
}

function HistTab({ graph, history, apply, usage }: PanelProps & { usage: Map<string, TechUsage> }) {
  if (history === null) return <p className="notice notice-error" role="alert">내 이력을 불러오지 못했어요. 확정한 게 없다는 뜻이 아니에요. 판 만들기는 그대로 쓸 수 있어요.</p>;
  if (!history.length) return <p className="muted">아직 확정한 청사진이 없어요. 위 "확정 · 내보내기"에서 확정하면 여기에 쌓여요.</p>;
  // 확인 창 대신 되돌리기(studio가 50단계 쌓음): 지금 판이 있으면 알림에서 되돌릴 수 있다고 말한다
  // 판과 이름을 한 되돌리기 칸에(apply의 name): 되돌리면 이름도 돌아가고, 시작 템플릿 표시도 studio가 지운다
  const load = (h: BlueprintRecord) => apply(...fromRecord(h, graph.stages.length > 0), h.name);
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
