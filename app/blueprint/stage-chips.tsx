"use client";
// 단계에 붙은 기술 칩 줄(속성 패널 · 목록 모드가 같이 씀, P-12e 조각 K). 칩 모양은 tech-chip(FrontLead).
// 관문 밖 기술(서랍 후보에 없는 것: 남의 조합 · 옛 이력)은 점선 후보 칩 + "적용 후보로 고르기"이고, 남아 있으면 확정이 막힌다(사용자 결정 "고르기 칩으로").
// 후보 칩에는 고르기 단추가 없어서 "자세히"를 따로 둔다(태그 · 사용기 · 상세를 키보드로도 열 수 있게).
import type { BlueprintTech } from "@/lib/blueprint/graph";
import type { PoolTech } from "@/lib/server/blueprints";
import { TechChip } from "./tech-chip";
import "./stage-chips.css";

type Props = {
  techs: BlueprintTech[]; pool: PoolTech[]; marking: string | null; className: string;
  /** 지금 고른 기술 id(이 단계 안에서). 없으면 null */ pickedTech: string | null;
  onPick: (techId: string) => void; onRemove: (t: BlueprintTech) => void; onCandidate: (t: BlueprintTech) => void;
};

export function StageChips({ techs, pool, marking, className, pickedTech, onPick, onRemove, onCandidate }: Props) {
  const info = new Map(pool.map((t) => [t.id, t]));
  const out = techs.filter((t) => !info.has(t.id));
  return (
    <>
      <ul className={className}>{techs.map((t) => {
        const known = info.get(t.id);
        return (
          <li key={t.id}>
            <TechChip tech={t} info={known} picked={pickedTech === t.id} onPick={() => onPick(t.id)} onRemove={() => onRemove(t)}
              onCandidate={known ? undefined : () => onCandidate(t)} busy={marking === t.id} />
            {known ? null : <button type="button" className="bp-link" aria-label={`${t.name} 자세히`} onClick={() => onPick(t.id)}>자세히</button>}
          </li>
        );
      })}</ul>
      {/* 고르기 단추의 뜻을 마우스 풍선(title)에만 두지 않는다: 키보드 · 터치 · 화면 읽기도 누르기 전에 알게 */}
      {out.length ? <p className="muted">점선 칩은 아직 적용 후보로 고르지 않은 기술이에요. 고르면 그 기술의 판단 대기 알림도 함께 판단되고, 고르기 전에는 확정할 수 없어요.</p> : null}
    </>
  );
}
