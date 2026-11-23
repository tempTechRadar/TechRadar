"use client";
// 둘러보기 따라 하기 6단계(점진적 향상): 서버 그림은 모든 단계 카드를 위아래로 다 보인다(스크립트가 꺼져도 다 읽힘, 목록 · 이전 · 다음은 #step-n 링크로 동작).
// 스크립트가 돌면 한 번에 한 카드만 보이고, 주소 해시(#step-3)로 단계를 공유하며, ← → 키로 넘긴다.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LOGIN_LABEL, STEPS, moveStep, splitUiNames, stepFromHash, stepHash } from "@/lib/tutorial/guide-steps";
import { StepMock } from "./mocks";

const Ui = ({ text }: { text: string }) => <>{splitUiNames(text).map((p, i) => (p.ui ? <b key={i} className="g-ui">{p.text}</b> : <span key={i}>{p.text}</span>))}</>;

/** 글을 쓰는 칸 · 펼침 단추에 초점이 있으면 화살표를 가로채지 않는다 */
const typing = (el: Element | null) => !!el && (el.matches("input, textarea, select, [contenteditable]") || !!el.closest("[contenteditable]"));

export function Guide() {
  const [cur, setCur] = useState<number | null>(null); // null = 스크립트 전(모든 카드 보임)
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    const fromHash = stepFromHash(location.hash, STEPS.length);
    setCur(fromHash ?? 0);
    // 해시로 들어왔으면 카드가 접힌 뒤 자리가 바뀌므로 그 카드로 다시 맞춘다
    if (fromHash !== null) requestAnimationFrame(() => box.current?.scrollIntoView({ block: "start" }));
    const onHash = () => { const n = stepFromHash(location.hash, STEPS.length); if (n !== null) setCur(n); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /** 단계 바꾸기: 해시는 기록을 쌓지 않고 바꾼다(뒤로 가기가 단계마다 걸리지 않게). focus = 새 카드 제목으로 초점(아래 이전 · 다음에서 눌렀을 때) */
  const go = useCallback((i: number, focus: boolean) => {
    setCur(i);
    history.replaceState(null, "", stepHash(i));
    if (focus) requestAnimationFrame(() => document.getElementById(`step-${i + 1}-title`)?.focus());
  }, []);

  useEffect(() => {
    if (cur === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      const active = document.activeElement;
      // 초점이 이 단계 영역이나 문서 바탕에 있을 때만(자주 묻는 질문 등 다른 곳에서 누른 화살표로 위 카드가 바뀌지 않게)
      if (typing(active) || (active && active !== document.body && !box.current?.contains(active))) return;
      const next = moveStep(cur, e.key === "ArrowLeft" ? -1 : 1, STEPS.length);
      if (next !== cur) { e.preventDefault(); go(next, box.current?.contains(active) ?? false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, go]);

  const link = (i: number, focus: boolean) => (e: React.MouseEvent) => { e.preventDefault(); go(i, focus); };

  return (
    <section ref={box} className="g-steps" aria-labelledby="g-steps-h" data-js={cur === null ? undefined : ""}>
      <h2 id="g-steps-h">따라 하기 6단계</h2>
      <p className="muted g-keys">{cur === null ? "단계마다 할 일과 실제 화면 모양을 차례로 보여 줘요." : "목록에서 단계를 고르거나 ← → 키로 넘겨요. 주소를 복사하면 지금 단계로 열려요."}</p>
      <div className="g-steps-grid">
        <nav aria-label="단계 목록" className="g-step-nav">
          <ol>{STEPS.map((s, i) => (
            <li key={s.id}>
              <a href={stepHash(i)} aria-current={cur === i ? "step" : undefined} onClick={link(i, false)}>
                <span className="g-num" aria-hidden="true">{i + 1}</span><span>{s.title}</span>
              </a>
            </li>
          ))}</ol>
        </nav>
        <div className="g-cards">{STEPS.map((s, i) => (
          <article key={s.id} id={`step-${i + 1}`} className="g-card-step" hidden={cur !== null && cur !== i} aria-labelledby={`step-${i + 1}-title`}>
            <header className="g-card-head">
              <span className="g-count">{i + 1} / {STEPS.length}</span>
              <h3 id={`step-${i + 1}-title`} tabIndex={-1}>{s.title}</h3>
              <span className="tag">{LOGIN_LABEL[s.login]}</span>
            </header>
            <p className="g-gist">{s.gist}</p>
            <div className="g-card-body">
              <ol className="g-actions">{s.actions.map((a) => <li key={a}><span><Ui text={a} /></span></li>)}</ol>
              <StepMock id={s.id} />
            </div>
            <footer className="g-card-foot">
              <Link className="btn" href={s.href}>{s.hrefLabel} 화면으로 가기</Link>
              <span className="g-pager">
                {i > 0 ? <a className="btn" href={stepHash(i - 1)} onClick={link(i - 1, true)}>← 이전</a> : null}
                {i < STEPS.length - 1 ? <a className="btn" href={stepHash(i + 1)} onClick={link(i + 1, true)}>다음: {STEPS[i + 1].title} →</a> : <a className="btn" href="#g-grades">다 봤어요. 등급 뜻 보기 ↓</a>}
              </span>
            </footer>
          </article>
        ))}</div>
      </div>
    </section>
  );
}
