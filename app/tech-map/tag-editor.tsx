"use client";
// 내 태그(11-21 사용자 결정 E "내 묶음"): 나만 보는 말로 기술을 묶는다. 붙이기 · 떼기는 바로 저장(서버 액션, 본인만 · RLS),
// 실패하면 보이는 태그를 그대로 두고 이유를 보인다(불변 4). 붙인 태그는 보기(필터)와 보드 묶기에 쓴다
import { useId, useState } from "react";
import { suggestTags, type TagFacts } from "@/lib/domain/tag-suggest";
import { addTagAction, removeTagAction, techTagsAction } from "./tag-actions";

const byKo = (a: string, b: string) => a.localeCompare(b, "ko");
const SAVE_FAIL = "저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요.";
const LIST_FAIL = "내 태그 목록을 불러오지 못했어요. 직접 써서 붙일 수는 있어요.";

/** 기술이 바뀌면 부르는 쪽이 key를 바꿔 새로 그린다. facts가 있으면 "자동 제안"(P-12f 8): 규칙으로 고른 후보를 체크 목록으로, 고른 것만 붙인다 */
export function TagEditor({ techId, tags, login, onChange, facts }: { techId: string | null; tags: string[]; login: boolean; onChange: (tags: string[]) => void; facts?: TagFacts }) {
  const [adding, setAdding] = useState(false);
  const [offer, setOffer] = useState<string[] | null>(null), [checked, setChecked] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [mine, setMine] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const listId = useId();
  if (!login || !techId) return null;
  const id = techId;

  /** 서버 액션이 던져도(연결 끊김) 단추가 막힌 채 남지 않게, 실패는 문구로 */
  async function run<T>(call: () => Promise<T>, fail = SAVE_FAIL): Promise<T | null> {
    setBusy(true); setMsg("");
    try { return await call(); } catch { setMsg(fail); return null; } finally { setBusy(false); }
  }
  async function open() {
    setAdding(true);
    const r = await run(() => techTagsAction(id), LIST_FAIL); // 자동 완성용 내 태그 종류(지도 밖 기술에 붙인 것까지). 못 읽어도 직접 쓰면 된다
    if (r?.ok) setMine(r.mine.map((m) => m.tag)); else if (r) setMsg(LIST_FAIL);
  }
  async function add() {
    const t = text.trim();
    if (!t) return;
    const r = await run(() => addTagAction(id, t));
    if (!r) return;
    if (!r.ok) return setMsg(r.message);
    if (!tags.some((x) => x.toLowerCase() === r.tag.toLowerCase())) onChange([...tags, r.tag].sort(byKo)); // 서버가 정리한 표기(앞뒤 공백 · 처음 적은 대소문자)
    setText("");
  }
  /** 고른 제안을 하나씩 붙인다(한도 · 비밀값 검사는 서버 그대로). 실패하면 거기서 멈추고 붙은 것까지만 보인다(불변 4) */
  async function addPicked() {
    let now = tags;
    for (const t of offer?.filter((x) => checked.has(x)) ?? []) {
      const r = await run(() => addTagAction(id, t));
      if (!r) break;
      if (!r.ok) { setMsg(r.message); break; }
      if (!now.some((x) => x.toLowerCase() === r.tag.toLowerCase())) now = [...now, r.tag].sort(byKo);
    }
    if (now !== tags) onChange(now);
    setOffer(null);
  }
  async function remove(t: string) {
    const r = await run(() => removeTagAction(id, t));
    if (!r) return;
    if (!r.ok) return setMsg(r.message);
    onChange(tags.filter((x) => x !== t));
  }

  return (
    <div className="side-mytags" role="group" aria-label="내 태그">
      {tags.map((t) => (
        <span key={t} className="tag tag-mine">{t}<button type="button" className="tag-x" aria-label={`태그 ${t} 떼기`} disabled={busy} onClick={() => remove(t)}>✕</button></span>
      ))}
      {adding ? (
        <form className="side-tag-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input aria-label="붙일 내 태그" list={listId} value={text} maxLength={30} autoFocus placeholder="예: 회사 프로젝트"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }} />
          <datalist id={listId}>{mine.filter((m) => !tags.includes(m)).map((m) => <option key={m} value={m} />)}</datalist>
          <button type="submit" className="chip" disabled={busy || !text.trim()}>붙이기</button>
          <button type="button" className="chip" onClick={() => setAdding(false)}>닫기</button>
        </form>
      ) : <button type="button" className="chip" onClick={() => void open()}>+ 내 태그</button>}
      {facts && !adding && offer === null ? <button type="button" className="chip" onClick={() => { const s = suggestTags(facts, tags); setOffer(s); setChecked(new Set(s)); }}>자동 제안</button> : null}
      {offer ? (
        <fieldset className="side-tag-form">
          <legend className="sr-only">붙일 제안 태그 고르기</legend>
          {offer.length ? offer.map((t) => (
            <label key={t} className="chip"><input type="checkbox" checked={checked.has(t)} onChange={(e) => { const n = new Set(checked); if (e.target.checked) n.add(t); else n.delete(t); setChecked(n); }} /> {t}</label>
          )) : <span className="muted">제안할 태그가 없어요(이미 붙었거나 분류 전이에요).</span>}
          {offer.length ? <button type="button" className="chip" disabled={busy || !checked.size} onClick={() => void addPicked()}>고른 것 붙이기</button> : null}
          <button type="button" className="chip" onClick={() => setOffer(null)}>닫기</button>
        </fieldset>
      ) : null}
      {msg ? <p className="notice notice-error" role="alert">{msg}</p> : null}
    </div>
  );
}
