"use client";
// 기술 칩(P-12e 스튜디오의 주인공): 종류 글자 아이콘 · 이름 · 등급 점. 단계 노드 · 하단 패널 · 속성 패널 · 목록 모드가 같은 모양을 쓴다.
// 등급은 색만이 아니라 글자로도(화면 읽기 · 색맹: aria-label과 title).
import { useState, type MouseEvent } from "react";
import type { BlueprintTech } from "@/lib/blueprint/graph";
import type { PoolTech } from "@/lib/server/blueprints";

const TYPE_GLYPH: Record<string, string> = { mcp: "M", skill: "S", plugin: "P", sdk: "D", concept: "C", agent: "A", hook: "H" };
/** 카탈로그 종류 이름(P-12j 규칙 3: 스킬은 사람의 역량이 아니라 SKILL.md 패키지) */
export const TYPE_KO: Record<string, string> = { mcp: "MCP", skill: "SKILL.md 패키지", plugin: "플러그인", sdk: "개발 도구", concept: "개념", agent: "에이전트", hook: "훅" };
const GRADE_KO: Record<PoolTech["grade"], string> = { danger: "보안 위험", caution: "보안 주의", pass: "알려진 취약점 없음", unknown: "보안 정보 없음" };

/** info = 서랍 후보에서 찾은 자세한 정보(없으면 이름만: 이력에서 온 기술 등)
 *  onCandidate = 관문 밖 기술(남의 조합 템플릿에서 온 것): 점선 "후보 칩" + "적용 후보로 고르기"(11-21 사용자 결정 "고르기 칩으로") */
/** fresh = 단계 노드가 이미 그려진 뒤에 붙은 칩(P-12g B4): 칩이 생길 때 한 번 정해 수명 동안 지킨다(크기가 바뀌어 다시 그려져도 다시 돌지 않게) */
export function TechChip({ tech, info, picked = false, onPick, onRemove, onCandidate, busy = false, fresh = false, drag = false }: {
  tech: BlueprintTech; info?: PoolTech; picked?: boolean; onPick?: () => void; onRemove?: () => void; onCandidate?: () => void; busy?: boolean; fresh?: boolean; /** 기술 노드 안(H2): 칩을 잡고 노드를 끌 수 있게 */ drag?: boolean;
}) {
  const [pop] = useState(fresh && !onCandidate); // 후보 칩으로 태어나 나중에 보통 칩이 될 때는 돌지 않게(B3는 색만 바뀜)
  const grade = info?.grade ?? "unknown", type = info?.type ?? "";
  const label = `${tech.name}${type ? `, ${TYPE_KO[type] ?? type}` : ""}, ${onCandidate ? "아직 판단 안 함" : GRADE_KO[grade]}`;
  const stop = (f?: () => void) => (e: MouseEvent) => { e.stopPropagation(); f?.(); }; // 노드 고르기 · 끌기와 겹치지 않게
  const body = <><span className="tc-icon" aria-hidden="true">{TYPE_GLYPH[type] ?? "·"}</span><span className="tc-name" aria-hidden="true">{tech.name}</span><i className="tc-dot" aria-hidden="true" /></>;
  if (onCandidate) return (
    <span className="tc tc-out">
      <span className="tc-name" title={label}>{tech.name}</span>
      <button type="button" className="tc-pick nodrag" disabled={busy} /* 보내는 중: 같은 판단을 두 번 보내지 않게(불변 3) */ aria-label={`${tech.name} 청사진에 담기`} title="판단 대기 알림이 있으면 그 알림도 함께 판단돼요" onClick={stop(onCandidate)}>{busy ? "담는 중…" : "청사진에 담기"}</button>
      {onRemove ? <button type="button" className="tc-x nodrag" aria-label={`${tech.name} 빼기`} onClick={stop(onRemove)}>✕</button> : null}
    </span>
  );
  return (
    <span className={pop ? "tc tc-pop" : "tc"} data-grade={grade} data-picked={picked ? "" : undefined}>
      {/* 고를 수 없는 곳(하단 패널 카드 · 읽기 전용 보기)에서는 단추가 아닌 글자로: 아무 일도 안 하는 단추에 Tab이 멈추지 않게 */}
      {onPick ? <button type="button" className={drag ? "tc-main" : "tc-main nodrag"} aria-label={label} aria-pressed={picked} title={label} onClick={stop(onPick)}>{body}</button>
        : <span className="tc-main" role="img" aria-label={label} title={label}>{body}</span>}
      {onRemove ? <button type="button" className="tc-x nodrag" aria-label={`${tech.name} 빼기`} onClick={stop(onRemove)}>✕</button> : null}
    </span>
  );
}
