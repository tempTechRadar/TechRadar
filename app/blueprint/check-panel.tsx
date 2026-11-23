"use client";
// 하단 패널 "AI 점검" 탭의 내용(P-12e I). 탭 틀은 dock이 그린다. 확정한 청사진(blueprintId)이 있을 때만 점검을 받을 수 있다.
// 위쪽은 코드가 확인한 사실(AI 없음, 늘 보임), 아래쪽은 "점검 받기"를 눌렀을 때만 만든 Claude의 제안 · 주의할 점. 제안만 하고 청사진은 바꾸지 않는다(불변 1).
// P-12q: 같은 결과에 내보내기 프롬프트 진단(중복 · 충돌 · 순서)과 다듬은 프롬프트 복사. 원래 내보내기 복사는 위 그대로다.
import { useEffect, useState, useTransition } from "react";
import type { Diagnosis, TechPair } from "@/lib/ai/parse-check-response";
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

const copyText = (text: string) => navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("보안 연결이 아니면 클립보드가 없음"));

function PromptDiagnosis({ d }: { d: Diagnosis }) {
  const [copied, setCopied] = useState("");
  const none = <p className="muted">찾지 못했어요. 전부 확인했다는 뜻은 아니에요.</p>;
  const pairs = (items: TechPair[]) => (items.length ? <ul className="bp-check-list">{items.map((x, i) => <li key={i}><b>{x.a} · {x.b}</b> — {x.reason}</li>)}</ul> : none);
  const copy = (text: string) => copyText(text).then(() => setCopied("다듬은 프롬프트를 복사했어요."), () => setCopied("복사하지 못했어요. 아래 글을 직접 골라 복사해 주세요."));
  return (
    <section aria-labelledby="bp-check-diag" className="bp-check-diag">
      <h4 id="bp-check-diag">내보낼 프롬프트 진단 <b className="bp-check-tag info">AI 제안 · 검증 아님</b></h4>
      <p className="muted">기술끼리 함께 써 본 데이터는 없어요. 이유를 읽고 직접 판단해 주세요.</p>
      <h5>중복</h5>{pairs(d.overlaps)}
      <h5>간섭 · 충돌</h5>{pairs(d.conflicts)}
      <h5>순서</h5>{d.order.length ? <ul className="bp-check-list">{d.order.map((t, i) => <li key={i}>{t}</li>)}</ul> : none}
      <h5>다듬은 프롬프트</h5>
      {d.revisedPrompt ? <>
        <button type="button" className="btn" onClick={() => void copy(d.revisedPrompt!)}>다듬은 프롬프트 복사</button>
        <span role="status" className="muted"> {copied}</span>
        <details><summary>다듬은 프롬프트 보기</summary><pre className="bp-check-pre">{d.revisedPrompt}</pre></details>
      </> : <p className="muted">다듬은 프롬프트가 없어요. 위 내보내기 복사를 그대로 쓰세요.</p>}
    </section>
  );
}

function Result({ latest }: { latest: NonNullable<CheckPanelData["latest"]> }) {
  const lines = (items: string[]) => <ul className="bp-check-list">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
  return (
    <div>
      <h4>제안</h4>{lines(latest.body.suggestions)}
      <h4>주의할 점 · 확인하지 못한 것</h4>{lines(latest.body.notes)}
      {latest.sources.length ? <p className="muted">참고한 곳: {latest.sources.map((u, i) => <span key={u}>{i ? ", " : ""}<Source label={u} url={u} /></span>)}</p> : null}
      {latest.body.diagnosis ? <PromptDiagnosis d={latest.body.diagnosis} /> : null}
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
        {/* pending은 같은 점검을 두 번 보내지 않게 disabled로 둔다. 오늘 다 쓴 것은 aria-disabled(이유 글 = 위 "오늘 n/n번") */}
        <button type="button" className="btn" onClick={used ? undefined : press} disabled={pending} aria-disabled={used || undefined} aria-describedby="bp-check-note">{pending ? "점검하는 중…" : "점검 받기"}</button>
        <div id="bp-check-note" aria-live="polite">{note?.message ? <p className={note.tone === "error" ? "notice" : "muted"}>{note.message}</p> : null}</div>
        {data.latest ? <Result latest={data.latest} /> : <p className="muted">아직 받은 점검이 없어요.</p>}
      </section>
    </div>
  );
}
