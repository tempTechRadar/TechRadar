"use client";
// 패널 샘플용 얇은 studio 대역: 그래프 상태 · 되돌리기 · 고른 것 · 단계만 들고 세 패널에 같은 PanelProps를 넘긴다(진짜 studio는 FrontLead 몫)
import { useState } from "react";
import { fromV1, type Graph } from "@/lib/blueprint/graph";
import { toBoard, type BlueprintRecord } from "@/lib/blueprint/stored";
import type { PoolTech } from "@/lib/server/blueprints";
import { Dock } from "../../blueprint/dock";
import { Inspector } from "../../blueprint/inspector";
import { ListMode } from "../../blueprint/list-mode";
import type { PanelProps, Picked, Step } from "../../blueprint/studio-types";
import { ToastLine, useToast } from "../../undo-toast";

export function PanelsSample({ pool, history, tags: start }: { pool: PoolTech[]; history: BlueprintRecord[]; tags: Record<string, string[]> }) {
  const [stack, setStack] = useState<Graph[]>(() => [fromV1(toBoard(history[0].board))]);
  const [picked, setPicked] = useState<Picked>(null);
  const [step, setStep] = useState<Step>(2);
  const [tags, setTags] = useState(start);
  const { toast, say, clear } = useToast();
  const graph = stack[stack.length - 1];
  const p: PanelProps = {
    graph, step, picked, onPick: setPicked, pool, tags, history, say, confirmedId: null, onName: () => undefined, onCandidate: () => undefined, marking: null,
    apply: (next, text) => { if (next === graph) return; setStack((s) => [...s.slice(-49), next]); if (text) say(text); },
    onTags: (id, t) => setTags((x) => ({ ...x, [id]: t })),
  };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="actions">
        {([1, 2, 3] as Step[]).map((s) => <button key={s} type="button" className="btn" aria-pressed={step === s} onClick={() => setStep(s)}>{s}단계</button>)}
        <button type="button" className="btn" disabled={stack.length < 2} onClick={() => setStack((s) => s.slice(0, -1))}>되돌리기</button>
      </p>
      <ToastLine toast={toast} clear={clear} className="notice" />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 320px)", gap: 12 }} className="sample-cols">
        <ListMode {...p} />
        <Inspector {...p} />
      </div>
      <Dock {...p} />
      <style>{"@media (max-width: 860px) { .sample-cols { grid-template-columns: 1fr !important; } }"}</style>
    </div>
  );
}
