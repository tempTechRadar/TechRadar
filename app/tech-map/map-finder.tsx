"use client";
// 지도 찾기 도우미(P-12w 사용자: 이름이 안 떠오를 때 특징으로 찾기). 청사진 가이드와 같은 로봇 · 말풍선(guide.css), 자리는 지도 오른쪽 아래 ⚙ 위.
// 특징을 말하면 지도 공개 목록 안에서 후보를 최대 5개(이름 · 등급 · 이유) 보여 주고, 누르면 찾기 막대와 같은 길로 그 점에 가서 서랍을 연다.
// AI는 찾기만 한다(담기 · 판단은 사람, 불변 1). 대화는 이 탭에만(sessionStorage). 손님은 로그인 안내만(호출 없음).
import { useEffect, useId, useRef, useState } from "react";
import type { FindReply } from "@/lib/ai/find-on-map";
import { MAP_FIND_PER_USER_PER_DAY } from "@/lib/ai/decide-ai-call";
import { Bot } from "../ai-bot";
import { findOnMapAction } from "./find-actions";
import "../blueprint/guide.css";

type Msg = { role: "user" | "guide"; text: string; reply?: FindReply; techs?: Record<string, { name: string; grade: string }> };
const HELLO: Msg = { role: "guide", text: "이름이 안 떠오르는 기술이 있나요? 하는 일이나 특징을 말해 주면 지도에서 찾아볼게요." };
const START: Msg[] = [HELLO]; // 아직 읽기 전: 이 값이면 저장하지 않는다
const GRADE_KO: Record<string, string> = { pass: "통과", caution: "주의", danger: "위험", unknown: "찾지 못함" };
const key = (who: string) => `techradar-map-find:${who}`;

/** 저장된 대화는 바깥 값이라 모양을 확인한다(깨진 값으로 지도가 죽지 않게) */
function load(who: string): Msg[] {
  let v: unknown;
  try { v = JSON.parse(sessionStorage.getItem(key(who)) ?? "null"); } catch { return [HELLO]; }
  const ok = (Array.isArray(v) ? v : []).flatMap((x): Msg[] => {
    const m = (x ?? {}) as Partial<Msg>;
    if ((m.role !== "user" && m.role !== "guide") || typeof m.text !== "string") return [];
    const good = m.reply && typeof m.reply.say === "string" && Array.isArray(m.reply.picks);
    return [{ role: m.role, text: m.text, ...(good ? { reply: m.reply, techs: m.techs ?? {} } : {}) }];
  });
  return ok.length ? ok : [HELLO];
}
const asTurn = (m: Msg) => ({ role: m.role, text: m.reply ? [m.reply.say, m.reply.ask].filter(Boolean).join(" ") : m.text });

/** onPick = 그 기술 점으로 가서 서랍 열기(없으면 이유 말풍선) */
export function MapFinder({ who, login, onPick }: { who: string; login: boolean; onPick: (techId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<Msg[]>(START);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hop, setHop] = useState(0);
  const id = useId(), btn = useRef<HTMLButtonElement>(null), input = useRef<HTMLTextAreaElement>(null), end = useRef<HTMLDivElement>(null);
  useEffect(() => { setLog(load(who)); }, [who]);
  useEffect(() => { if (log === START) return; try { sessionStorage.setItem(key(who), JSON.stringify(log.slice(-30))); } catch { /* 이번 화면에서만 */ } }, [log, who]);
  useEffect(() => { const el = end.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, [log, open, busy]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...log, { role: "user" as const, text: t }];
    setLog(next); setDraft(""); setBusy(true); setError(null);
    const r = await findOnMapAction(next.map(asTurn)).catch(() => ({ ok: false as const, message: "찾기 도우미에게 보내지 못했어요. 잠시 뒤 다시 물어봐 주세요." }));
    setBusy(false);
    if (!r.ok) { setLog(log); setDraft(t); return setError(r.message); } // 보내지 못한 말은 입력칸으로
    setLog((l) => [...l, { role: "guide", text: r.reply.say, reply: r.reply, techs: r.techs }]); setHop((h) => h + 1);
  }
  const close = () => { setOpen(false); btn.current?.focus(); };

  return (
    <div className="guide map-finder" onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); close(); } }}>
      {open ? (
        <section id={id} className="guide-pop" role="dialog" aria-label="지도 찾기 도우미">
          <header className="guide-head"><b>지도 찾기 도우미</b><span className="guide-tag">AI 제안 · 검증 아님</span>
            <button type="button" className="guide-x" aria-label="찾기 도우미 닫기" onClick={close}>✕</button></header>
          {!login ? (
            <div className="guide-log"><p className="guide-msg">로그인하면 설명으로 찾아 줘요. 이름을 알면 아래 찾기 막대를 써 주세요.</p>
              <a className="btn btn-primary" href={`/login?next=${encodeURIComponent("/")}`}>로그인</a></div>
          ) : (<>
            <div className="guide-log" aria-live="polite">
              {log.map((m, i) => (
                <div key={i} className="guide-row" data-role={m.role}>
                  <p className="guide-msg">{m.reply ? m.reply.say : m.text}{m.reply?.ask ? <b className="guide-ask"> {m.reply.ask}</b> : null}</p>
                  {m.reply?.picks.length ? (
                    <div className="guide-card"><span className="guide-label">후보</span>
                      <ul>{m.reply.picks.map((p) => { const t = m.techs?.[p.id]; return (
                        <li key={p.id}><span className="guide-tech"><b>{t?.name ?? p.id}</b>{t ? <span className="guide-grade" data-grade={t.grade}>{GRADE_KO[t.grade] ?? t.grade}</span> : null}</span>
                          {p.why ? <span className="guide-why">{p.why}</span> : null}
                          <button type="button" className="btn btn-sm" onClick={() => onPick(p.id)}>지도에서 보기</button></li>); })}</ul>
                    </div>) : null}
                </div>
              ))}
              {busy ? <p className="guide-msg guide-busy">찾는 중…</p> : null}
              {error ? <p className="guide-err" role="alert">{error}</p> : null}
              <div ref={end} />
            </div>
            <form className="guide-form" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
              <textarea ref={input} rows={2} maxLength={400} value={draft} placeholder="예: 브라우저를 띄워 테스트해 주는 MCP" aria-label="찾고 싶은 기술의 특징"
                onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()}>찾기</button>
            </form>
            <p className="guide-foot">지도 목록 안에서만 찾아요. 하루 {MAP_FIND_PER_USER_PER_DAY}번 · 대화는 이 탭에만 남아요.
              {log.length > 1 ? <button type="button" className="guide-reset" onClick={() => { setLog([HELLO]); setError(null); }}>새로 시작</button> : null}</p>
          </>)}
        </section>
      ) : null}
      <button ref={btn} type="button" className="guide-btn" aria-label={open ? "지도 찾기 도우미 닫기" : "지도 찾기 도우미 열기(특징으로 기술 찾기)"} aria-expanded={open} aria-controls={id} onClick={() => (open ? close() : setOpen(true))}>
        <Bot hop={hop} />
      </button>
    </div>
  );
}
