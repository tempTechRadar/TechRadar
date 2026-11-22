// 청사진 스튜디오 패널(P-12e 조각 K: 하단 패널 · 속성 패널 · 목록 모드)이 쓰는 순수 계산. 화면 · DB · xyflow를 모른다.
// 그래프를 바꾸는 것은 graph.ts 편집 함수이고, 여기는 무엇을 보일지 · 왜 못 바꾸는지만 정한다.
import { STAGE_NAME_MAX, cleanName } from "./board.ts";
import { addStage, connect, createStage, LAYOUT, LIMITS, layers, type ConnectProblem, type Graph, type Pos, type Stage, type TemplateKind } from "./graph.ts";
import { contentKey } from "./draft.ts";
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

/** 같은 일은 같은 말(P-12h S4): 캔버스 · 속성 패널 · 목록 모드 · 하단 패널이 넣기 · 빼기 · 잇기 · 끊기에 같은 토스트 */
export const putSaid = (stage: string, tech: string) => `${stage}에 ${tech}을(를) 넣었어요.`;
/** 이름 바꾸기(카드 · 서랍 · 목록 같은 말). 검사는 nameProblem */
export const renamedSaid = (name: string) => `단계 이름을 "${name.trim()}"(으)로 바꿨어요.`;
/** 카드 "✕ 지우기"(확인 창 없음, 토스트의 되돌리기로 살림) */
export const removedStageSaid = (stage: string) => `"${stage}" 단계를 지웠어요. 6초 안에 되돌리기로 살릴 수 있어요.`;
export const removeSaid = (stage: string, tech: string) => `${stage}에서 ${tech}을(를) 뺐어요.`;
export function linkSaid(g: Graph, from: string, to: string, cut: boolean): string {
  const name = (id: string) => g.stages.find((s) => s.id === id)?.name ?? "없는 단계";
  return `${name(from)} → ${name(to)} 연결을 ${cut ? "끊었어요" : "이었어요"}.`;
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

type Added = { graph: Graph; stage: Stage; linked: boolean } | { problem: string };
/** 그 자리에 이미 단계가 있다(반 칸 안) */
const taken = (g: Graph, p: Pos) => g.stages.some((o) => Math.abs(o.x - p.x) < LAYOUT.x / 2 && Math.abs(o.y - p.y) < LAYOUT.y / 2);

/** 새 단계를 at에 두고 before → 새 단계 → after로 잇는다(P-12h S3: 선 끌어 새 블록 · 같은 순서에 더하기, 한 번의 apply = 되돌리기 한 칸).
 *  연결 한도(200) 등으로 다 잇지 못하면 단계만 더하고 linked=false(화면이 "이었어요"라고 하지 않게). 이을 것이 없었으면 linked=false. 못 더하면 이유 글 */
export function addStageLinked(g: Graph, name: string, at: Pos, link: { before: string[]; after: string[] }): Added {
  const why = addStageProblem(g, name);
  if (why) return { problem: why };
  const stage = createStage(name.trim(), at.x, at.y);
  let graph = addStage(g, stage);
  const base = graph.edges.length, want = link.before.length + link.after.length;
  for (const b of link.before) graph = connect(graph, b, stage.id);
  for (const a of link.after) graph = connect(graph, stage.id, a);
  // 어느 길(선 끌기 · ＋ 단계 · 목록)로 더해도 같은 순서 4개를 넘기지 않는다(확정 때서야 알지 않게)
  const l = layers(graph), d = l.ok ? l.depth.get(stage.id) : undefined;
  if (l.ok && d !== undefined && l.levels[d].length > LIMITS.parallel) return { problem: fullOrder(d) };
  return { graph, stage, linked: want > 0 && graph.edges.length === base + want };
}

/** 새 단계 더하기(P-12h S1, 캔버스 "＋ 단계" · 목록 모드가 같은 규칙): 고른 단계(after)가 있으면 그 오른쪽 빈자리(겹치면 아래로)에 두고
 *  고른 단계 → 새 단계로 잇는다. 없으면 맨 오른쪽 단계 옆, 잇지 않음 */
export function addStageAfter(g: Graph, name: string, after: Stage | undefined): Added {
  return addStageLinked(g, name, after ? sideSpot(g, after, 1) : newStageSpot(g), { before: after ? [after.id] : [], after: [] });
}

/** 앞(-1) · 다음(1) 단계 자리(P-12h-2 T1 카드 왼쪽 · 오른쪽 +, ＋ 단계): 그 단계 왼쪽 · 오른쪽 한 칸, 차 있으면 아래로 */
export function sideSpot(g: Graph, of: Stage, dir: -1 | 1): Pos {
  let at = { x: of.x + dir * LAYOUT.x, y: of.y };
  for (let i = 0; taken(g, at) && i < LIMITS.stages; i++) at = { x: at.x, y: at.y + LAYOUT.y };
  return at;
}

/** 같은 순서(병렬)에 단계를 더하지 못하는 이유: 그 단계와 같은 순서에 이미 LIMITS.parallel개. 고리가 있어 순서를 모르면 막지 않는다(확정 때 막힘) */
export function parallelProblem(g: Graph, id: string): string | null {
  const l = layers(g);
  const d = l.ok ? l.depth.get(id) : undefined;
  return l.ok && d !== undefined && l.levels[d].length >= LIMITS.parallel ? fullOrder(d) : null;
}
const fullOrder = (d: number) => `${d + 1}번째 순서에 이미 ${LIMITS.parallel}개예요(동시에 ${LIMITS.parallel}개까지).`;

/** 같은 순서에 더하기(P-12h S3): 그 단계 위(-1) · 아래(1)로 한 칸(겹치면 더 그쪽), 앞 단계 선을 그대로 복사해 같은 깊이가 되게 */
export function addStageBeside(g: Graph, name: string, of: Stage, dir: -1 | 1): Added {
  const why = parallelProblem(g, of.id);
  if (why) return { problem: why };
  return addStageLinked(g, name, besideSpot(g, of, dir), { before: neighbors(g, of.id).before.map((s) => s.id), after: [] });
}
export function besideSpot(g: Graph, of: Stage, dir: -1 | 1): Pos {
  let at = { x: of.x, y: of.y + dir * LAYOUT.y };
  for (let i = 0; taken(g, at) && i < LIMITS.stages; i++) at = { x: at.x, y: at.y + dir * LAYOUT.y };
  return at;
}

/** UUID v4. crypto.randomUUID는 https · localhost에서만 있어 http(휴대폰으로 PC 주소)에서는 getRandomValues로 만든다(use-studio-save.ts와 같은 방법) */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// 템플릿 저장 id: 탭이 닫혔다 열려도(단계를 바꾸면 탭이 바뀜) 같은 내용이면 같은 id라 모듈에 둔다. 새로 고치면 비지만 그때는 DB 함수가 같은 id만 "exists"로 본다
const savedIds = new Map<string, string>();
/** 같은 내용(종류 · 이름 + 확정과 같은 contentKey: 단계 · 기술 · 연결선 · 나란히 순서, 위치는 뺌)이면 같은 id(불변 3: 두 번 저장해도 한 줄). 다른 내용을 거쳐 돌아와도 같다 */
export function templateSaveId(kind: TemplateKind, name: string, g: Graph, make: () => string = uuid): string {
  const key = contentKey([kind, name.trim()], g);
  if (!savedIds.has(key)) savedIds.set(key, make());
  return savedIds.get(key)!;
}
