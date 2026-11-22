// 청사진 점검의 "사실"(P-12e H): AI 없이 코드가 판단한다. 지금 그래프와 읽어 둔 기술 정보만 본다(DB · 화면 · AI를 모름).
// 사실마다 출처(label · url)를 단다. AI 점검(I)은 이 사실을 재료로 받아 제안만 하고, 청사진은 바꾸지 않는다(불변 1).
// 읽지 못한 것(기술 정보 없음 · 수집 오류 · 등급 못 찾음)은 "문제 없음"이 아니라 "확인하지 못했어요"로 적는다(불변 2).
// 문제가 없는 것은 사실로 만들지 않는다: 이 목록에 없다는 것은 "확인했고 괜찮다"가 아니라 "알려 줄 것이 없다"는 뜻이다.
import type { Grade } from "../domain/grade.ts";
import { COLLECT_ERROR_TEXT } from "../domain/my-tech-view.ts";
import { isConcept } from "../map/build-map.ts";
import { layers, type Graph, type Stage } from "./graph.ts";

export type CheckTech = {
  id: string; name: string; techKey: string | null; type: string | null;
  grade: Grade; gradeReason: string | null;
  /** 마지막 활동(release | commit)과 그 시각. 읽지 못했으면 null */
  lastActivityAt: string | null; lastActivityKind: string | null;
  /** 마지막 수집에서 읽지 못한 이유(timeout · network · rate_limited · http_status · parse). 없으면 null */
  collectErrorKind: string | null;
  /** 근거를 볼 수 있는 곳(저장소 · 상세). 없으면 null */
  link: string | null;
};
/** 관리자가 확정한 같은 역할 짝만(후보 · 시뮬레이터 것은 부르는 쪽이 뺀다) */
export type SameRolePair = { a: string; b: string; quote: string | null; confirmedAt: string | null };
export type CheckInput = { graph: Graph; techs: CheckTech[]; sameRole: SameRolePair[]; now: Date };

export type FactKind = "danger" | "caution" | "unread" | "collect_error" | "stale" | "overlap" | "empty_stage";
export type Severity = "risk" | "warn" | "info";
export type FactSource = { label: string; url: string | null };
export type Fact = { kind: FactKind; severity: Severity; stageIds: string[]; techIds: string[]; text: string; source: FactSource };

/** 이 기간 넘게 새 릴리스(또는 변경)가 없으면 "오래됐다"고 알린다(팀 추정 — 첫 사용 뒤 고침) */
export const STALE_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const RANK: Record<Severity, number> = { risk: 0, warn: 1, info: 2 };
const SRC = { grade: "보안 등급(OSV 취약점 DB · 저장소 확인)", activity: "저장소 활동 기록", error: "수집 기록", tech: "기술 정보", graph: "이 청사진" } as const;

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const day = (iso: string) => iso.slice(0, 10);

/** 한 단계 안의 한 기술에 대한 사실. 정보를 못 읽은 기술은 "확인 못 함" 하나만 */
function techFacts(stage: Stage, name: string, id: string, tech: CheckTech | undefined, now: Date): Fact[] {
  const base = { stageIds: [stage.id], techIds: [id] };
  if (!tech) return [{ ...base, kind: "unread", severity: "info", text: `"${name}"의 정보를 읽지 못해서 확인하지 못했어요.`, source: { label: SRC.tech, url: null } }];
  if (isConcept(tech.techKey, tech.type)) return []; // 개념은 설치물이 아니라 등급 · 저장소가 없다(ADR 0008)
  const out: Fact[] = [];
  const grade = { label: SRC.grade, url: tech.link };
  const why = tech.gradeReason ? `: ${short(tech.gradeReason, 120)}` : "";
  if (tech.grade === "danger") out.push({ ...base, kind: "danger", severity: "risk", text: `"${tech.name}"은(는) 위험 등급이에요${why}`, source: grade });
  if (tech.grade === "caution") out.push({ ...base, kind: "caution", severity: "warn", text: `"${tech.name}"은(는) 주의 등급이에요${why}`, source: grade });
  if (tech.grade === "unknown" && !tech.collectErrorKind) out.push({ ...base, kind: "unread", severity: "info", text: `"${tech.name}"은(는) 아직 등급을 찾지 못해서 확인하지 못했어요.`, source: grade });
  if (tech.collectErrorKind) {
    const cause = COLLECT_ERROR_TEXT[tech.collectErrorKind] ?? tech.collectErrorKind;
    out.push({ ...base, kind: "collect_error", severity: "info", text: `"${tech.name}"은(는) 마지막 수집에서 ${cause}. 그 부분은 확인하지 못했어요.`, source: { label: SRC.error, url: null } });
  } else out.push(...staleFact(base, tech, now));
  return out;
}

/**
 * 수집 오류가 있으면 활동 시각도 믿을 수 없어서 말하지 않는다(위 호출이 else로 막음).
 * 오류는 없는데 시각이 비었거나 읽을 수 없거나 미래면 "문제 없음"으로 읽히지 않게 "확인하지 못했어요"를 남긴다(불변 2).
 */
function staleFact(base: Pick<Fact, "stageIds" | "techIds">, tech: CheckTech, now: Date): Fact[] {
  const at = tech.lastActivityAt ? Date.parse(tech.lastActivityAt) : NaN;
  const days = Math.floor((now.getTime() - at) / DAY_MS);
  if (!Number.isFinite(days) || days < 0) {
    return [{ ...base, kind: "unread", severity: "info", text: `"${tech.name}"의 마지막 활동 날짜를 확인하지 못했어요.`, source: { label: SRC.activity, url: tech.link } }];
  }
  if (days < STALE_DAYS) return [];
  const what = tech.lastActivityKind === "release" ? "릴리스가" : "변경이";
  return [{ ...base, kind: "stale", severity: "warn", text: `"${tech.name}"은(는) 마지막 ${what} ${Math.floor(days / 30)}개월 전이에요(${day(tech.lastActivityAt!)}).`, source: { label: SRC.activity, url: tech.link } }];
}

function overlapFacts(g: Graph, byId: Map<string, CheckTech>, pairs: SameRolePair[]): Fact[] {
  const where = (techId: string) => g.stages.filter((s) => s.techs.some((t) => t.id === techId));
  const nameOf = (techId: string) => byId.get(techId)?.name ?? g.stages.flatMap((s) => s.techs).find((t) => t.id === techId)?.name ?? "";
  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const p of pairs) {
    const key = [p.a, p.b].sort().join("|");
    const [sa, sb] = [where(p.a), where(p.b)];
    if (p.a === p.b || seen.has(key) || !sa.length || !sb.length) continue;
    seen.add(key);
    const together = sa.find((s) => sb.includes(s));
    const stageIds = [...new Set([...sa, ...sb].map((s) => s.id))];
    const place = together ? `"${together.name}" 단계에 같이 있어요` : `서로 다른 단계(${[...new Set([...sa, ...sb].map((s) => `"${s.name}"`))].join(", ")})에 있어요`;
    const quote = p.quote ? ` 근거: "${short(p.quote, 120)}"` : "";
    out.push({ kind: "overlap", severity: "warn", stageIds, techIds: [p.a, p.b], text: `"${nameOf(p.a)}"과(와) "${nameOf(p.b)}"는 같은 역할이라고 확인된 기술인데 ${place}.${quote}`, source: { label: `같은 역할 관계(관리자 확인${p.confirmedAt ? ` ${day(p.confirmedAt)}` : ""})`, url: null } });
  }
  return out;
}

/** 위험 → 주의 · 겹침 · 오래됨 → 확인 못 함 · 빈 단계 순(같은 무게는 순서 단계 순). 청사진에 단계가 없으면 빈 목록 */
export function checkFacts(input: CheckInput): Fact[] {
  const { graph } = input;
  const byId = new Map(input.techs.map((t) => [t.id, t]));
  const l = layers(graph);
  const order = l.ok ? l.levels.flat() : graph.stages.map((s) => s.id);
  const facts: Fact[] = [];
  for (const id of order) {
    const s = graph.stages.find((x) => x.id === id)!;
    if (!s.techs.length) facts.push({ kind: "empty_stage", severity: "info", stageIds: [s.id], techIds: [], text: `"${s.name}" 단계에는 아직 기술이 없어요.`, source: { label: SRC.graph, url: null } });
    for (const t of s.techs) facts.push(...techFacts(s, t.name, t.id, byId.get(t.id), input.now));
  }
  facts.push(...overlapFacts(graph, byId, input.sameRole));
  return facts.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
