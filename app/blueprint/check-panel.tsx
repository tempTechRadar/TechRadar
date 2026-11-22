"use client";
// 하단 패널 "AI 점검" 탭의 내용(P-12e I). 탭 틀은 dock이 그린다. 확정한 청사진(blueprintId)이 있을 때만 점검을 받을 수 있다.
// 위쪽은 코드가 확인한 사실(AI 없음, 늘 보임), 아래쪽은 "점검 받기"를 눌렀을 때만 만든 Claude의 제안 · 주의할 점. 제안만 하고 청사진은 바꾸지 않는다(불변 1).
import { useEffect, useState, useTransition } from "react";
import { loadCheckAction, runCheckAction, type CheckPanelData, type CheckRun } from "./check-actions";
import "./check-panel.css";

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: CheckPanelData };
const SEVERITY_LABEL = { risk: "위험", warn: "주의", info: "확인 못 함 · 참고" } as const;
const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

function Source({ label, url }: { label: string; url: string | null }) {
  const href = safeUrl(url);
  return <span className="bp-check-src">출처: {href ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a> : label}</span>;
}

function FactList({ facts }: { facts: CheckPanelData["facts"] }) {
  if (facts.length === 0) return <p className="muted">코드가 알려 줄 만한 문제는 찾지 못했어요. 전부 확인했다는 뜻은 아니에요.</p>;
  return (
    <ul className="bp-check-list">
      {facts.map((f, i) => <li key={i}><b className={`bp-check-tag ${f.severity}`}>{SEVERITY_LABEL[f.severity]}</b> {f.text} <Source {...f.source} /></li>)}
    </ul>
  );
}

function Result({ latest }: { latest: NonNullable<CheckPanelData["latest"]> }) {
  const lines = (items: string[]) => <ul className="bp-check-list">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
  return (
    <div>
      <h4>제안</h4>{lines(latest.body.suggestions)}
      <h4>주의할 점 · 확인하지 못한 것</h4>{lines(latest.body.notes)}
      {latest.sources.length ? <p className="muted">참고한 곳: {latest.sources.map((u, i) => <span key={u}>{i ? ", " : ""}<Source label={u} url={u} /></span>)}</p> : null}
    </div>
  );
}

export function CheckPanel({ blueprintId }: { blueprintId: string | null }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [note, setNote] = useState<CheckRun | null>(null);
  const [pending, start] = useTransition();

  const refresh = (id: string) => loadCheckAction(id).then((r) => setLoad(r.ok ? { kind: "ready", data: r.data } : { kind: "error", message: r.message }));
  useEffect(() => {
    if (!blueprintId) return;
    setLoad({ kind: "loading" });
    void refresh(blueprintId);
  }, [blueprintId]);

  if (!blueprintId) return <p className="muted">확정한 청사진에서 점검을 받을 수 있어요. 위 "확정 · 내보내기"에서 먼저 확정해 주세요.</p>;
  if (load.kind === "loading") return <p role="status" className="muted">점검 내용을 읽는 중이에요…</p>;
  if (load.kind === "error") return <p className="notice" role="alert">{load.message}</p>;
  const { data } = load;
  const used = data.usedToday >= data.limit;
  const press = () => start(async () => { setNote(await runCheckAction(blueprintId)); await refresh(blueprintId); });

  return (
    <div className="bp-check">
      <section aria-labelledby="bp-check-facts">
        <h3 id="bp-check-facts">코드가 확인한 것</h3>
        <FactList facts={data.facts} />
      </section>
      <section aria-labelledby="bp-check-ai">
        <h3 id="bp-check-ai">AI 점검</h3>
        <p className="muted">누를 때만 Claude에게 물어봐요. 제안만 하고 청사진은 바뀌지 않아요. 오늘 {data.usedToday}/{data.limit}번 썼어요.</p>
        <button type="button" className="btn" onClick={press} disabled={pending || used} aria-describedby="bp-check-note">{pending ? "점검하는 중…" : "점검 받기"}</button>
        <div id="bp-check-note" aria-live="polite">{note?.message ? <p className={note.tone === "error" ? "notice" : "muted"}>{note.message}</p> : null}</div>
        {data.latest ? <Result latest={data.latest} /> : <p className="muted">아직 받은 점검이 없어요.</p>}
      </section>
    </div>
  );
}
