// 화면에서 채점 실행(P-20, /admin/demo 채점 칸). 주인: 차세일(C).
// lib/eval(score·actual·record)은 고치지 않고 부르기만 한다. 네트워크 없음: 저장된 OSV 응답(lib/domain/fixtures)과 시험용 스킬(sim/skills)만 읽는다.
// 실행 기록은 trigger "scoring"(start_scoring → score → score_save)으로 남아 흐름 화면에 칠해진다(불변 6).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeActual, type Reader } from "../eval/actual.ts";
import { recordScoring } from "../eval/record.ts";
import { scoreCases, type GoldCase, type Score } from "../eval/score.ts";

/** 저장소 뿌리(root) 기준으로 파일을 읽는다. 경로는 정답 파일에 적힌 상대 경로만 쓴다 */
export function fsReader(root: string): Reader {
  const at = (p: string) => join(root, p);
  return {
    readJson: (p) => JSON.parse(readFileSync(at(p), "utf8")),
    readDir: (dir) =>
      (readdirSync(at(dir), { recursive: true, encoding: "utf8" }) as string[])
        .map((rel) => rel.replaceAll("\\", "/"))
        .filter((rel) => statSync(join(at(dir), rel)).isFile())
        .sort()
        .map((rel) => ({ path: rel, text: readFileSync(join(at(dir), rel), "utf8") })),
  };
}

export type EvalDeps = { db: SupabaseClient; reader: Reader; record?: typeof recordScoring };
export type EvalRun = { runId: string; score: Score };

/** 정답 파일 읽기 → 사례마다 앱 규칙으로 실제 결과 → 채점 → 실행 기록. 정답 파일을 못 읽으면 기록 없이 던진다 */
export async function runScoring(deps: EvalDeps, input: { adminId: string }): Promise<EvalRun> {
  const gold = (deps.reader.readJson("eval/gold.json") as { cases?: GoldCase[] }).cases;
  if (!Array.isArray(gold) || gold.length === 0) throw new Error("정답 파일(eval/gold.json)에 사례가 없어요");
  const score = scoreCases(gold, gold.map((c) => computeActual(c, deps.reader)));
  const runId = await (deps.record ?? recordScoring)(deps.db, score, { path: "화면 표시(/admin/demo, 파일은 저장하지 않음)", startedBy: input.adminId });
  return { runId, score };
}
