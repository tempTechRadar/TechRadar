"use client";
// 메뉴의 "+ 기술 넣기" 대화상자(design.md 13절 5): 한 줄에 하나 붙여 넣기 → 찾은 것마다 지도에서 보기 · 관심, 못 찾으면 직접 추가로.
// 영상·SNS 링크는 기술을 알 수 없어 "본 이름을 적어 주세요". 스크린샷으로 찾기는 넣지 않는다(14절).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GRADE_KO } from "@/lib/map/build-map";
import { InterestButton } from "../new/interest-button";
import { findCapture, type CaptureState } from "./actions";
import "./capture.css";

export function CaptureDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<CaptureState>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []); // 대화상자는 메뉴 밖(body)에 그린다: 메뉴 모양이 번지지 않고 nav 안에 들어가지 않게
  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setState(await findCapture(text).catch(() => ({ error: "찾지 못했어요. 잠시 뒤 다시 시도해 주세요." })));
    setBusy(false);
  }
  const close = () => dialog.current?.close();
  return (
    <>
      <button type="button" className="site-nav-add" onClick={() => dialog.current?.showModal()}>찾기 · 넣기</button>
      {mounted ? createPortal(<dialog ref={dialog} className="capture" aria-labelledby="capture-title">
        <div className="capture-head"><h2 id="capture-title">기술 찾기 · 넣기</h2><button type="button" className="btn" onClick={close} aria-label="닫기">✕</button></div>
        <form onSubmit={find}>
          <label htmlFor="capture-text">한 줄에 하나씩: GitHub·npm·PyPI 주소, 설치 명령(npx …), 기술 이름</label>
          <textarea id="capture-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"https://github.com/upstash/context7\nnpx -y mcp-remote\nplaywright"} />
          <button type="submit" className="btn btn-primary" aria-disabled={busy || !text.trim()}>{busy ? "찾는 중…" : "찾기"}</button>{/* disabled면 초점이 대화상자 밖으로 빠진다 */}
        </form>
        {state && "error" in state ? <p className="notice notice-error" role="alert">{state.error}</p> : null}
        <p className="sr-only" aria-live="polite">{busy ? "찾는 중이에요" : state && "results" in state ? `${state.results.length}줄을 찾았어요. 아래 결과를 보세요.` : ""}</p>
        {state && "results" in state ? (
          <ul className="capture-results">{state.results.map(({ line, hits }) => (
            <li key={line.text}>
              <span className="muted capture-line">{line.text}</span>
              {line.kind === "media" ? <p>영상·SNS 링크예요. 거기서 본 기술 이름을 적어 주세요.</p>
                : line.kind === "bad" ? <p>{line.reason}</p>
                : hits === null ? <p className="notice-error">찾은 결과를 불러오지 못했어요. 없다는 뜻이 아니에요. 다시 찾아 주세요.</p>
                : hits.length === 0 ? <p>모은 기술에서 찾지 못했어요. <Link href="/dashboard#add-title" onClick={close}>내 프로젝트에 직접 추가</Link>할 수 있어요.</p>
                : <ul>{hits.map((h) => (
                    <li key={h.id} className="capture-hit">
                      <div><b>{h.name}</b>{h.grade === "danger" || h.grade === "caution" ? <span className={`badge ${h.grade === "danger" ? "badge-danger" : "badge-warning"}`}> {GRADE_KO[h.grade]}</span> : null}{h.oneLiner ? <span className="muted">{h.oneLiner}</span> : null}</div>
                      <span className="capture-actions"><a className="btn" href={`/?sel=${encodeURIComponent(`tech:${h.id}`)}`}>지도에서 보기</a>{/* 지도 화면에서 눌러도 새로 열려 그 기술을 고르게 */}<InterestButton techId={h.id} initial={h.mark} /></span>
                    </li>
                  ))}</ul>}
            </li>
          ))}</ul>
        ) : null}
      </dialog>, document.body) : null}
    </>
  );
}
