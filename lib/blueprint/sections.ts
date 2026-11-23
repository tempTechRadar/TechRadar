// 청사진 섹션(P-12o 2단계, 11-23 사용자 인터뷰): 여러 단계를 이름 있는 묶음으로 감싸고, 섹션이 공통 기술을 따로 가진다(안의 단계들이 공유).
// 규칙: 한 단계는 한 섹션에만(겹침 · 중첩 없음), 섹션당 단계 2개 이상, 이름 1~20자, 공통 기술 8개까지, 섹션 24개까지.
// 저장 모양 graph.sections = [{ id, name, stageIds, techs: [{ id, name }] }](비면 키 없음). DB blueprint_graph_clean(202611240100)이 같은 규칙으로 정리한다.
// 내보내기는 섹션 머리에 한 번("섹션 이름: 단계 A · B — 공통 기술: X, Y"), 공통 기술은 섹션 첫 단계 전에 설치. DB · 화면을 모르는 순수 함수
import type { Graph } from "./graph.ts";

export type SectionTech = { id: string; name: string };
export type Section = { id: string; name: string; stageIds: string[]; techs: SectionTech[] };
export const SECTION = { max: 24, techs: 8, nameMax: 20, minStages: 2 } as const;
const ID = /^[A-Za-z0-9_-]{1,64}$/; // graph.ts 단계 id와 같은 규칙(DB가 같은 정규식으로 본다)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** DB와 같은 이름 다듬기: 20글자(코드포인트)로 자른 뒤 앞뒤 스페이스만 지움(btrim(left(name, 20))) */
export const sectionName = (s: string) => [...s].slice(0, SECTION.nameMax).join("").replace(/^ +| +$/g, "");

/** 맞지 않는 섹션 · 칸은 그 섹션만 빼고(판을 버리지 않음, 관계선과 같음) 없어진 단계는 지운다. 남은 단계가 2개 미만이면 섹션도 뺀다 */
export function cleanSections(stageIds: Iterable<string>, raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  const stages = new Set(stageIds), used = new Set<string>(), ids = new Set<string>(), out: Section[] = [];
  for (const r of raw) {
    if (out.length >= SECTION.max) break;
    const s = (r ?? {}) as { id?: unknown; name?: unknown; stageIds?: unknown; techs?: unknown };
    const name = typeof s.name === "string" ? sectionName(s.name) : "";
    if (typeof s.id !== "string" || !ID.test(s.id) || ids.has(s.id) || stages.has(s.id) || !name || !Array.isArray(s.stageIds)) continue;
    const members = [...new Set(s.stageIds.filter((x): x is string => typeof x === "string" && stages.has(x) && !used.has(x)))];
    if (members.length < SECTION.minStages) continue;
    const seen = new Set<string>();
    const techs = (Array.isArray(s.techs) ? s.techs : []).flatMap((t) => {
      const v = (t ?? {}) as { id?: unknown; name?: unknown };
      if (typeof v.id !== "string" || !UUID.test(v.id) || seen.has(v.id) || seen.size >= SECTION.techs) return []; // DB는 uuid가 아닌 id를 판째 거절해서 미리 뺀다
      seen.add(v.id);
      return [{ id: v.id, name: typeof v.name === "string" ? v.name : v.id }];
    });
    members.forEach((m) => used.add(m)); ids.add(s.id);
    out.push({ id: s.id, name, stageIds: members, techs });
  }
  return out;
}

/** sections를 다시 단다(비면 키를 지움) */
export function withSections(g: Graph, list: Section[]): Graph {
  const { sections: _old, ...rest } = g;
  return list.length ? { ...rest, sections: list } : rest;
}
/** 단계를 지우거나 바꾼 뒤: 없어진 단계를 빼고, 2개 미만이 된 섹션을 푼다 */
export const keepSections = (g: Graph): Graph => (g.sections ? withSections(g, cleanSections(g.stages.map((s) => s.id), g.sections)) : g);
export const sectionOf = (g: Graph, stageId: string): Section | undefined => g.sections?.find((s) => s.stageIds.includes(stageId));

type Result = { ok: true; graph: Graph; section: Section } | { ok: false; message: string };
/** 고른 단계들을 섹션으로 묶기. 이미 다른 섹션에 든 단계는 못 묶는다(겹침 없음) */
export function groupSection(g: Graph, stageIds: string[], name: string, id = `sec-${Date.now().toString(36)}`): Result {
  const nm = sectionName(name.trim()), members = [...new Set(stageIds)].filter((x) => g.stages.some((s) => s.id === x));
  if (!nm) return { ok: false, message: "섹션 이름을 적어 주세요." };
  if (members.length < SECTION.minStages) return { ok: false, message: `섹션은 단계 ${SECTION.minStages}개 이상을 묶어요.` };
  const taken = members.map((m) => sectionOf(g, m)).find(Boolean);
  if (taken) return { ok: false, message: `"${taken.name}" 섹션에 이미 든 단계가 있어요. 그 섹션을 먼저 풀어 주세요.` };
  if ((g.sections?.length ?? 0) >= SECTION.max) return { ok: false, message: `섹션은 ${SECTION.max}개까지예요.` };
  const section: Section = { id, name: nm, stageIds: members, techs: [] };
  return { ok: true, graph: withSections(g, [...(g.sections ?? []), section]), section };
}
export const ungroupSection = (g: Graph, id: string): Graph => withSections(g, (g.sections ?? []).filter((s) => s.id !== id));
const edit = (g: Graph, id: string, f: (s: Section) => Section): Graph => withSections(g, (g.sections ?? []).map((s) => (s.id === id ? f(s) : s)));

/** 섹션 공통 기술 넣기: 위험 등급 · 이미 있음 · 8개는 막고 이유를 돌려준다 */
export function putSectionTech(g: Graph, id: string, tech: SectionTech & { grade: string }): { ok: true; graph: Graph } | { ok: false; message: string } {
  const s = g.sections?.find((x) => x.id === id);
  if (!s) return { ok: false, message: "섹션을 찾지 못했어요." };
  if (tech.grade === "danger") return { ok: false, message: "위험 등급 기술은 청사진에 넣지 않아요." };
  if (s.techs.some((t) => t.id === tech.id)) return { ok: false, message: `${s.name} 섹션에 이미 있어요.` };
  if (s.techs.length >= SECTION.techs) return { ok: false, message: `섹션 공통 기술은 ${SECTION.techs}개까지예요.` };
  return { ok: true, graph: edit(g, id, (x) => ({ ...x, techs: [...x.techs, { id: tech.id, name: tech.name }] })) };
}
export const removeSectionTech = (g: Graph, id: string, techId: string): Graph => edit(g, id, (x) => ({ ...x, techs: x.techs.filter((t) => t.id !== techId) }));

const one = (s: string) => s.replace(/\s+/g, " ").trim();
/** 내보내기 머리 줄: "섹션 「이름」: 단계 A · B — 공통 기술: X, Y(이 섹션 첫 단계 전에 먼저 설치)" */
export function sectionLines(g: Graph): string[] {
  const name = new Map(g.stages.map((s) => [s.id, s.name]));
  return (g.sections ?? []).map((s) => `섹션 「${one(s.name)}」: 단계 ${s.stageIds.map((x) => one(name.get(x) ?? "")).filter(Boolean).join(" · ")}`
    + (s.techs.length ? ` — 공통 기술: ${s.techs.map((t) => one(t.name)).join(", ")}(이 섹션 첫 단계 전에 먼저 설치)` : ""));
}
