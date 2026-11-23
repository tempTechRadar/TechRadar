// 청사진 가이드 답 읽기(P-12s). say만 꼭 있어야 하고, 나머지 칸은 모양이 틀린 항목만 버린다(대화가 끊기지 않게).
// 지어내기 막기: 넘긴 목록에 없는 id · 위험 등급 · 판에 없는 단계로 가는 기술 · 설치 명령이 든 글은 버린다. 판에 넣는 것은 사람이 누른다(불변 1).
import { COMMAND_LINE, readJson } from "./parse-scenario-response.ts";

export const GUIDE = { say: 400, ask: 200, summary: 200, name: 20, why: 120, stages: 7, techs: 12 } as const;
export type GuideStage = { name: string; why: string };
export type GuideTechPick = { stage: string; id: string; why: string };
export type GuideReply = { say: string; ask: string | null; summary: string | null; stages: GuideStage[]; techs: GuideTechPick[] };
export type GuideParse = ({ ok: true } & GuideReply) | { ok: false; error: string };

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && !COMMAND_LINE.test(v) ? v.trim().slice(0, max) : null);
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/** grades = 넘긴 목록의 id → 등급, boardStages = 지금 판 단계 이름(기술은 여기 있는 단계로만) */
export function parseGuideResponse(raw: string, grades: Map<string, string>, boardStages: string[]): GuideParse {
  const v = readJson(raw);
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "답이 JSON 한 개가 아니에요" };
  const r = v as Record<string, unknown>;
  const say = text(r.say, GUIDE.say);
  if (!say) return { ok: false, error: "say가 비어 있어요" };
  const seen = new Set<string>();
  const stages = list(r.stages).flatMap((x) => {
    const s = (x ?? {}) as Record<string, unknown>;
    const name = typeof s.name === "string" ? s.name.trim().slice(0, GUIDE.name).trim() : "";
    if (!name || seen.has(name) || COMMAND_LINE.test(name)) return [];
    seen.add(name);
    return [{ name, why: text(s.why, GUIDE.why) ?? "" }];
  }).slice(0, GUIDE.stages);
  const onBoard = new Set(boardStages);
  const picked = new Set<string>();
  const techs = list(r.techs).flatMap((x) => {
    const t = (x ?? {}) as Record<string, unknown>;
    const id = typeof t.id === "string" ? t.id.trim() : "", stage = typeof t.stage === "string" ? t.stage.trim() : "";
    const grade = grades.get(id);
    if (!grade || grade === "danger" || !onBoard.has(stage) || picked.has(`${stage}|${id}`)) return [];
    picked.add(`${stage}|${id}`);
    return [{ stage, id, why: text(t.why, GUIDE.why) ?? "" }];
  }).slice(0, GUIDE.techs);
  return { ok: true, say, ask: text(r.ask, GUIDE.ask), summary: text(r.summary, GUIDE.summary), stages, techs };
}
