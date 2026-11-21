// 청사진 스튜디오 패널(P-12e 조각 K: 하단 패널 · 속성 패널 · 목록 모드)이 쓰는 순수 계산. 화면 · DB · xyflow를 모른다.
// 그래프를 바꾸는 것은 graph.ts 편집 함수이고, 여기는 무엇을 보일지 · 왜 못 바꾸는지만 정한다.
import { STAGE_NAME_MAX, cleanName } from "./board.ts";
import { LIMITS, layers, type ConnectProblem, type Graph, type Pos, type Stage, type TemplateKind } from "./graph.ts";
import { fitsStage } from "./knowledge.ts";
import type { TechUsage } from "./stored.ts";

type PoolLike = { id: string; name: string; field: string | null; sub: string | null; projects: number };
/** stage: 고른 단계 이름(그 단계에 맞는 것만), tag: 내 태그 하나로 거르기, add: 보드에서 "청사진에 넣기"로 온 기술(늘 맨 앞, 거르기 무시) */
export type PoolFilter = { stage: string | null; term: string; tag: string | null; tags: Record<string, string[]> | null; add: string | null; usage: Map<string, TechUsage> };

/** 하단 패널 기술 탭: 거른 뒤 넣으러 온 기술 → 내가 확정에 자주 쓴 순 → 내 프로젝트 수 → 이름순 */
export function filterPool<T extends PoolLike>(pool: T[], f: PoolFilter): T[] {
  const term = f.term.trim().toLowerCase();
  const fits = (t: T) => t.id === f.add
    || ((!f.stage || fitsStage(f.stage, t)) && (!term || t.name.toLowerCase().includes(term)) && (!f.tag || Boolean(f.tags?.[t.id]?.includes(f.tag))));
  const used = (t: T) => f.usage.get(t.id)?.n ?? 0;
  return pool.filter(fits).sort((a, b) => Number(b.id === f.add) - Number(a.id === f.add) || used(b) - used(a) || b.projects - a.projects || a.name.localeCompare(b.name));
}

/** 거르기에 고를 내 태그: 서랍 후보에 붙은 것만, 이름순 */
export const poolTags = (pool: { id: string }[], tags: Record<string, string[]> | null): string[] =>
  [...new Set(pool.flatMap((t) => tags?.[t.id] ?? []))].sort((a, b) => a.localeCompare(b));

/** 목록 모드 순서: 깊이마다 한 줄(같은 줄 = 동시에). 고리가 있으면 그 단계 id를 알리고 저장 순서대로 한 줄씩 */
export function listRows(g: Graph): { rows: Stage[][]; cycle: string[] | null } {
  const l = layers(g);
  if (!l.ok) return { rows: g.stages.map((s) => [s]), cycle: l.cycle };
  const byId = new Map(g.stages.map((s) => [s.id, s]));
  return { rows: l.levels.map((ids) => ids.flatMap((id) => byId.get(id) ?? [])), cycle: null };
}

/** 이 단계로 들어오는(앞) · 나가는(다음) 단계 */
export function neighbors(g: Graph, id: string): { before: Stage[]; after: Stage[] } {
  const byId = new Map(g.stages.map((s) => [s.id, s]));
  const pick = (ids: string[]) => ids.flatMap((x) => byId.get(x) ?? []);
  return { before: pick(g.edges.filter((e) => e.to === id).map((e) => e.from)), after: pick(g.edges.filter((e) => e.from === id).map((e) => e.to)) };
}

export const CONNECT_KO: Record<ConnectProblem, string> = {
  self: "자기 자신과는 이을 수 없어요.", missing: "없는 단계예요. 화면을 새로 고쳐 주세요.", exists: "이미 이어져 있어요.",
  cycle: "이으면 순서가 돌고 돌아서(고리) 이을 수 없어요.", limit: `연결은 ${LIMITS.edges}개까지예요.`,
};

/** 기술을 단계에 넣지 못하는 이유. null이면 넣을 수 있음(putTech가 같은 그래프를 돌려줄 때 화면에 보일 말) */
export function putProblem(stage: Stage, tech: { id: string; grade: string }): string | null {
  if (tech.grade === "danger") return "위험 등급 기술은 청사진에 넣지 않아요.";
  if (stage.techs.some((t) => t.id === tech.id)) return `${stage.name}에 이미 있어요.`;
  if (stage.techs.length >= LIMITS.techs) return `한 단계에 기술은 ${LIMITS.techs}개까지예요.`;
  return null;
}

/** 단계 이름을 못 쓰는 이유(이름 바꾸기). null이면 됨 */
export const nameProblem = (name: string): string | null => (cleanName(name) ? null : `단계 이름을 1~${STAGE_NAME_MAX}자로 적어 주세요.`);
/** 새 단계를 못 더하는 이유. null이면 됨 */
export const addStageProblem = (g: Graph, name: string): string | null =>
  nameProblem(name) ?? (g.stages.length >= LIMITS.stages ? `단계는 ${LIMITS.stages}개까지예요.` : null);

/** 목록 모드에서 더한 단계의 캔버스 자리: 맨 오른쪽 단계의 오른쪽(겹치지 않게). 자동 정렬은 캔버스 단추가 한다 */
export const newStageSpot = (g: Graph): Pos => {
  const right = g.stages.reduce<Stage | null>((m, s) => (!m || s.x > m.x ? s : m), null);
  return right ? { x: right.x + 280, y: right.y } : { x: 0, y: 0 };
};

// 템플릿 저장 id: 탭이 닫혔다 열려도(단계를 바꾸면 탭이 바뀜) 같은 내용이면 같은 id라 모듈에 둔다. 새로 고치면 비지만 그때는 DB 함수가 같은 id만 "exists"로 본다
const savedIds = new Map<string, string>();
/** 같은 내용(종류 · 이름 · 단계 id · 이름 · 기술 + 연결선, 위치는 뺌)이면 같은 id(불변 3: 두 번 저장해도 한 줄). 다른 내용을 거쳐 돌아와도 같다 */
export function templateSaveId(kind: TemplateKind, name: string, g: Graph, make: () => string = () => crypto.randomUUID()): string {
  const key = JSON.stringify([kind, name.trim(), g.stages.map((s) => [s.id, s.name, s.techs.map((t) => t.id)]), g.edges]);
  if (!savedIds.has(key)) savedIds.set(key, make());
  return savedIds.get(key)!;
}
