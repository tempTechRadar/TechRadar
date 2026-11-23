"use client";
// 지도 위 "시작하기 n/3"(접힘). 닫으면 이 브라우저 · 이 계정에서는 다시 안 보인다(편의 기억이라 브라우저 저장, 못 쓰면 다음에 다시 보일 뿐)
import Link from "next/link";
import { useEffect, useState } from "react";
import type { StartStep } from "@/lib/onboarding/start-steps";

export function StartChecklist({ steps, who }: { steps: StartStep[]; who: string }) {
  const KEY = `techradar-start-hidden:${who}`; // 한 컴퓨터를 여럿이 써도 내가 닫은 것만
  const [hidden, setHidden] = useState(true); // 서버 그림과 맞추려 처음엔 숨기고, 브라우저 기억을 읽은 뒤 보인다
  useEffect(() => { try { setHidden(localStorage.getItem(KEY) === "1"); } catch { setHidden(false); } }, [KEY]);
  if (hidden) return null;
  const done = steps.filter((s) => s.done).length;
  const hide = () => { setHidden(true); try { localStorage.setItem(KEY, "1"); } catch { /* 저장을 막은 브라우저: 이번만 숨김 */ } };
  return (
    <details className="map-start">
      <summary className="map-chip">시작하기 <strong>{done}/{steps.length}</strong></summary>
      <div className="map-start-body">
        <ol>{steps.map((s) => (
          <li key={s.label} className={s.done ? "done" : undefined}>
            <span aria-hidden="true">{s.done ? "✓" : "○"}</span>
            {s.done ? <span>{s.label}<span className="sr-only"> (했어요)</span></span> : <Link href={s.href}>{s.label}</Link>}
          </li>
        ))}</ol>
        <p className="muted">처음이라면 <Link href="/guide">Tutorial</Link>에서 순서를 먼저 봐요.</p>
        <button type="button" className="btn" onClick={hide}>그만 보기</button>
      </div>
    </details>
  );
}
