"use client";
// 기술 칩(P-12e 스튜디오의 주인공): 종류 글자 아이콘 · 이름 · 등급 점. 단계 노드 · 하단 패널 · 속성 패널 · 목록 모드가 같은 모양을 쓴다.
// 등급은 색만이 아니라 글자로도(화면 읽기 · 색맹: aria-label과 title).
import type { MouseEvent } from "react";
import type { BlueprintTech } from "@/lib/blueprint/graph";
import type { PoolTech } from "@/lib/server/blueprints";

const TYPE_GLYPH: Record<string, string> = { mcp: "M", skill: "S", plugin: "P", sdk: "D", concept: "C", agent: "A", hook: "H" };
const TYPE_KO: Record<string, string> = { mcp: "MCP", skill: "스킬", plugin: "플러그인", sdk: "개발 도구", concept: "개념", agent: "에이전트", hook: "훅" };
const GRADE_KO: Record<PoolTech["grade"], string> = { danger: "보안 위험", caution: "보안 주의", pass: "알려진 취약점 없음", unknown: "보안 정보 없음" };

/** info = 서랍 후보에서 찾은 자세한 정보(없으면 이름만: 이력에서 온 기술 등) */
export function TechChip({ tech, info, picked = false, onPick, onRemove }: {
  tech: BlueprintTech; info?: PoolTech; picked?: boolean; onPick?: () => void; onRemove?: () => void;
}) {
  const grade = info?.grade ?? "unknown", type = info?.type ?? "";
  const label = `${tech.name}${type ? `, ${TYPE_KO[type] ?? type}` : ""}, ${GRADE_KO[grade]}`;
  const stop = (f?: () => void) => (e: MouseEvent) => { e.stopPropagation(); f?.(); }; // 노드 고르기 · 끌기와 겹치지 않게
  return (
    <span className="tc" data-grade={grade} data-picked={picked ? "" : undefined}>
      <button type="button" className="tc-main nodrag" aria-label={label} aria-pressed={onPick ? picked : undefined} title={label} onClick={stop(onPick)}>
        <span className="tc-icon" aria-hidden="true">{TYPE_GLYPH[type] ?? "·"}</span>
        <span className="tc-name">{tech.name}</span>
        <i className="tc-dot" aria-hidden="true" />
      </button>
      {onRemove ? <button type="button" className="tc-x nodrag" aria-label={`${tech.name} 빼기`} onClick={stop(onRemove)}>✕</button> : null}
    </span>
  );
}
