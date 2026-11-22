"use client";
// 옅은 새 단계 블록(P-12h S3): 선을 빈 곳에 놓거나 블록 위 · 아래 +를 누르면 그 자리에 뜨는 이름 입력.
// Enter = 더하기(studio가 한 번의 apply로 단계 + 선), Esc · 다른 곳 누름(blur) = 취소.
import { ViewportPortal } from "@xyflow/react";
import { useRef, useState } from "react";
import { STAGE_NAME_MAX } from "@/lib/blueprint/board";
import type { Pos } from "@/lib/blueprint/graph";

/** kind: 어느 쪽에 붙는지(알림 글), of: 기준 단계 이름, before · after: 새 단계로 이을 단계 id, hints: 그 자리(순서)에 맞는 추천 이름,
 *  from: 열 때 초점이 있던 곳(+ 단추 등, Enter · Esc 뒤 돌아갈 곳) */
export type Ghost = { at: Pos; kind: "after" | "before" | "beside" | "between"; of: string; before: string[]; after: string[]; hints: string[]; from: HTMLElement | null;
  /** between(U2 선 위 +): 없앨 선 */ cut?: { from: string; to: string } };
const LABEL: Record<Ghost["kind"], (of: string) => string> = {
  after: (of) => `"${of}" 다음 단계 이름`, before: (of) => `"${of}" 앞 단계 이름`, beside: (of) => `"${of}"와(과) 같은 순서 단계 이름`, between: (of) => `${of} 사이 단계 이름`,
};

/** back = Enter · Esc로 끝낼 때 초점을 돌려놓을 곳(입력이 사라지며 body로 떨어지지 않게). blur로 끝나면 초점은 이미 간 곳 그대로 */
export function GhostStage({ ghost, back, onCommit, onCancel }: { ghost: Ghost; back: () => void; onCommit: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const ended = useRef(false), focused = useRef(false);
  // 입력이 실제로 생길 때(ViewportPortal은 한 박자 늦게 그릴 수 있음) 지금 이벤트가 끝난 뒤 초점: 놓는 순간(mouseup)에 주면 바로 blur돼 취소되므로.
  // 다음 프레임(rAF)은 백그라운드 탭에서 오지 않아 setTimeout 0
  const grab = (el: HTMLInputElement | null) => { if (el && !focused.current) { focused.current = true; setTimeout(() => { if (el.isConnected && !ended.current) el.focus(); }, 0); } };
  const end = (ok: boolean, focus: boolean) => {
    if (ended.current) return; // Enter 뒤 입력이 사라지며 오는 blur가 또 돌지 않게
    ended.current = true;
    if (focus) back();
    if (ok) onCommit(name.trim()); else onCancel();
  };
  return (
    <ViewportPortal>
      <form className="sn sn-ghost nodrag nopan" style={{ transform: `translate(${ghost.at.x}px, ${ghost.at.y}px)` }}
        onClick={(e) => e.stopPropagation()} // 입력을 누른 것이 캔버스 빈 곳 누름(취소)으로 올라가지 않게
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) end(true, true); }}>
        <label className="sn-ghost-label">{LABEL[ghost.kind](ghost.of)}
          <input ref={grab} value={name} maxLength={STAGE_NAME_MAX} list="studio-ghost-hints" placeholder="이름 적고 Enter" onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); end(false, true); } }} onBlur={() => end(false, false)} />
        </label>
        <datalist id="studio-ghost-hints">{ghost.hints.map((h) => <option key={h} value={h} />)}</datalist>
      </form>
    </ViewportPortal>
  );
}
