"use client";
// 청사진 가이드 캐릭터(P-12s 사용자): 판 오른쪽 아래에 사는 작은 관측소 로봇(레이더 접시 머리, 자체 그림). 누르면 말풍선 대화가 열린다.
// 문제정의부터 한 번에 하나씩 묻고 → 단계 제안 → [판에 넣기] → 단계마다 기술 후보 → [넣기]. AI는 제안만, 넣는 것은 사람이 누른다(불변 1).
// 대화는 이 브라우저 탭에만(sessionStorage, 못 쓰면 이번 화면에서만). 손님은 로그인 안내만(호출 없음).
import { useEffect, useId, useRef, useState } from "react";
import type { GuideReply } from "@/lib/ai/parse-guide-response";
import { BLUEPRINT_GUIDE_PER_USER_PER_DAY } from "@/lib/ai/decide-ai-call";
import { Bot } from "../ai-bot";
import { guideTurnAction } from "./guide-actions";
import "./guide.css";

type Msg = { role: "user" | "guide"; text: string; reply?: GuideReply; techs?: Record<string, { name: string; grade: string }>; done?: string[] };
/** onStages는 판이 바뀌었을 때만 true. placed = 그 단계에 그 기술이 지금 판에 있는지("넣음"은 판을 보고 그린다: 막히거나 저장 실패면 단추가 남음, 불변 4) */
type Props = { who: string; guest: boolean; stages: string[]; drawer: boolean;
  onStages: (names: string[], mode: "replace" | "append") => boolean; onTech: (stage: string, techId: string) => void; placed: (stage: string, techId: string) => boolean };

const HELLO: Msg = { role: "guide", text: "안녕하세요, 청사진 가이드예요. 어떤 문제를 풀고 싶어요? 누가 쓰나요?" };
const GRADE_KO: Record<string, string> = { pass: "통과", caution: "주의", unknown: "찾지 못함" };
const key = (who: string) => `techradar-bp-guide:${who}`;
const START: Msg[] = [HELLO]; // 아직 읽기 전: 이 값이면 저장하지 않는다(읽기 전에 빈 대화로 덮지 않게)

/** 저장된 대화는 바깥 값이라 모양을 확인한다(예전 모양 · 깨진 값으로 판 화면이 죽지 않게): 틀린 말은 빼고, 틀린 제안은 글만 남긴다 */
function load(who: string): Msg[] {
  let v: unknown;
  try { v = JSON.parse(sessionStorage.getItem(key(who)) ?? "null"); } catch { return [HELLO]; }
  const ok = (Array.isArray(v) ? v : []).flatMap((x): Msg[] => {
    const m = (x ?? {}) as Partial<Msg>;
    if ((m.role !== "user" && m.role !== "guide") || typeof m.text !== "string") return [];
    const r = m.reply;
    const good = r && typeof r.say === "string" && Array.isArray(r.stages) && Array.isArray(r.techs);
    return [{ role: m.role, text: m.text, ...(good ? { reply: r, techs: m.techs ?? {}, done: Array.isArray(m.done) ? m.done : [] } : {}) }];
  });
  return ok.length ? ok : [HELLO];
}
/** AI에게 넘기는 대화: 가이드 말은 say + ask만 */
const asTurn = (m: Msg) => ({ role: m.role, text: m.reply ? [m.reply.say, m.reply.ask].filter(Boolean).join(" ") : m.text });

export function Guide({ who, guest, stages, drawer, onStages, onTech, placed }: Props) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<Msg[]>(START);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hop, setHop] = useState(0);
  const id = useId(), btn = useRef<HTMLButtonElement>(null), input = useRef<HTMLTextAreaElement>(null), end = useRef<HTMLDivElement>(null);
  useEffect(() => { setLog(load(who)); }, [who]);
  useEffect(() => { if (log === START) return; try { sessionStorage.setItem(key(who), JSON.stringify(log.slice(-40))); } catch { /* 이번 화면에서만 */ } }, [log, who]);
  useEffect(() => { const el = end.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, [log, open, busy]); // 새 말이 보이게(대화 칸 안에서만)
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...log, { role: "user" as const, text: t }];
    setLog(next); setDraft(""); setBusy(true); setError(null);
    const r = await guideTurnAction(next.map(asTurn), stages).catch(() => ({ ok: false as const, message: "가이드에게 보내지 못했어요. 잠시 뒤 다시 말해 주세요." }));
    setBusy(false);
    if (!r.ok) { setLog((l) => (l === next ? log : l)); setDraft(t); return setError(r.message); } // 보내지 못한 말은 대화에서 빼고 입력칸으로(다시 보낼 때 두 번 쌓이지 않게)
    setLog((l) => (l === next ? [...l, { role: "guide", text: r.reply.say, reply: r.reply, techs: r.techs }] : l)); // 그사이 "새로 시작"했으면 옛 답은 버림 setHop((h) => h + 1);
  }
  const mark = (i: number, k: string) => setLog((l) => l.map((m, j) => (j === i ? { ...m, done: [...(m.done ?? []), k] } : m)));
  const close = () => { setOpen(false); btn.current?.focus(); };

  return (
    <div className="guide" data-drawer={drawer ? "" : undefined} onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); close(); } }}>
      {open ? (
        <section id={id} className="guide-pop" role="dialog" aria-label="청사진 가이드">
          <header className="guide-head"><b>청사진 가이드</b><span className="guide-tag">AI 가이드 · 제안</span>
            <button type="button" className="guide-x" aria-label="가이드 닫기" onClick={close}>✕</button></header>
          {guest ? (
            <div className="guide-log"><p className="guide-msg">로그인하면 같이 설계해요. 문제정의부터 단계 · 기술까지 하나씩 물어볼게요.</p>
              <a className="btn btn-primary" href={`/login?next=${encodeURIComponent("/blueprint")}`}>로그인</a></div>
          ) : (<>
            <div className="guide-log" aria-live="polite">
              {log.map((m, i) => (
                <div key={i} className="guide-row" data-role={m.role}>
                  <p className="guide-msg">{m.reply ? m.reply.say : m.text}{m.reply?.ask ? <b className="guide-ask"> {m.reply.ask}</b> : null}</p>
                  {m.reply?.summary ? (
                    <div className="guide-card"><span className="guide-label">문제정의</span><p>{m.reply.summary}</p>
                      {i === log.length - 1 ? <div className="guide-acts"><button type="button" className="btn btn-sm" onClick={() => void send("맞아요. 단계를 제안해 주세요.")}>맞아요</button>
                        <button type="button" className="btn btn-sm" onClick={() => { setDraft("고칠래요: "); input.current?.focus(); }}>고칠래요</button></div> : null}
                    </div>) : null}
                  {m.reply?.stages.length ? (
                    <div className="guide-card"><span className="guide-label">단계 제안</span>
                      <ol>{m.reply.stages.map((s) => <li key={s.name}><b>{s.name}</b>{s.why ? ` — ${s.why}` : ""}</li>)}</ol>
                      {m.done?.includes("stages") ? <p className="guide-done">판에 넣었어요. 되돌리기로 돌아갈 수 있어요.</p>
                        : stages.length === 0 ? <button type="button" className="btn btn-sm btn-primary" onClick={() => { if (onStages(m.reply!.stages.map((s) => s.name), "replace")) mark(i, "stages"); }}>판에 넣기</button>
                        : <div className="guide-acts"><button type="button" className="btn btn-sm" onClick={() => { if (onStages(m.reply!.stages.map((s) => s.name), "replace")) mark(i, "stages"); }}>지금 판 덮어쓰기</button>
                          <button type="button" className="btn btn-sm" onClick={() => { if (onStages(m.reply!.stages.map((s) => s.name), "append")) mark(i, "stages"); }}>뒤에 붙이기</button></div>}
                    </div>) : null}
                  {m.reply?.techs.length ? (
                    <div className="guide-card"><span className="guide-label">기술 제안</span>
                      <ul>{m.reply.techs.map((p) => { const t = m.techs?.[p.id], k = `${p.stage}|${p.id}`; return (
                        <li key={k}><span className="guide-tech"><small>{p.stage} ›</small> <b>{t?.name ?? p.id}</b>{t ? <span className="guide-grade" data-grade={t.grade}>{GRADE_KO[t.grade] ?? t.grade}</span> : null}</span>
                          {p.why ? <span className="guide-why">{p.why}</span> : null}
                          {placed(p.stage, p.id) ? <span className="guide-done">넣음</span> : <button type="button" className="btn btn-sm" onClick={() => onTech(p.stage, p.id)}>넣기</button>}</li>); })}</ul>
                    </div>) : null}
                </div>
              ))}
              {busy ? <p className="guide-msg guide-busy">생각하는 중…</p> : null}
              {error ? <p className="guide-err" role="alert">{error}</p> : null}
              <div ref={end} />
            </div>
            <form className="guide-form" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
              <textarea ref={input} rows={2} maxLength={500} value={draft} placeholder="자유롭게 말해 주세요" aria-label="가이드에게 말하기"
                onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()}>보내기</button>
            </form>
            <p className="guide-foot">AI 제안이에요. 판에는 직접 넣어요. 하루 {BLUEPRINT_GUIDE_PER_USER_PER_DAY}번 · 대화는 이 탭에만 남아요.
              {log.length > 1 ? <button type="button" className="guide-reset" onClick={() => { setLog([HELLO]); setError(null); }}>새로 시작</button> : null}</p>
          </>)}
        </section>
      ) : null}
      <button ref={btn} type="button" className="guide-btn" aria-label={open ? "청사진 가이드 닫기" : "청사진 가이드 열기"} aria-expanded={open} aria-controls={id} onClick={() => (open ? close() : setOpen(true))}>
        <Bot hop={hop} />
      </button>
    </div>
  );
}
