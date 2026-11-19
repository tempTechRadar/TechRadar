// 채점 스크립트: `npm run eval` → eval/result.json, eval/result.md. 네트워크·DB를 쓰지 않는다(저장된 OSV 응답과 시험용 스킬만).
// 등급 사례(cases, G1–G9)와 경계 사례(edgeCases: 사건 종류·변화 없음·수집 실패·거절·보류·두 번 입력)를 따로 세고 전체 수를 더한다.
// 실행 기록(runs·run_steps)에 남기는 일은 lib/eval/record.ts가 맡고, 서비스 키가 필요해 이 스크립트에서는 부르지 않는다.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { GRADE_RULE_VERSION } from "../lib/domain/grade.ts";
import { computeActual, type Reader } from "../lib/eval/actual.ts";
import { scoreCases, toMarkdown, type GoldCase } from "../lib/eval/score.ts";
import { computeEdgeActual } from "../lib/eval/edge.ts";
import { edgeMarkdown, overallTotals, scoreEdges, type EdgeActual, type EdgeCase } from "../lib/eval/edge-score.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const at = (p: string) => join(root, p);

const reader: Reader = {
  readJson: (p) => JSON.parse(readFileSync(at(p), "utf8")),
  readDir: (dir) =>
    (readdirSync(at(dir), { recursive: true, encoding: "utf8" }) as string[])
      .filter((rel) => statSync(join(at(dir), rel)).isFile())
      .sort()
      .map((rel) => ({ path: relative(at(dir), join(at(dir), rel)).replaceAll("\\", "/"), text: readFileSync(join(at(dir), rel), "utf8") })),
};

const file = JSON.parse(readFileSync(at("eval/gold.json"), "utf8")) as { cases: GoldCase[]; edgeCases?: EdgeCase[] };
const gold = file.cases;
const score = scoreCases(gold, gold.map((c) => computeActual(c, reader)));
// 경계 사례는 차례로 채점한다: OSV 응답을 fetch 자리에 잠깐 넣었다 되돌리므로 동시에 돌리지 않는다
const edgeGold = file.edgeCases ?? [];
const edgeActuals: EdgeActual[] = [];
for (const c of edgeGold) edgeActuals.push(await computeEdgeActual(c, reader));
const edges = scoreEdges(edgeGold, edgeActuals);
const overall = overallTotals(score.totals, edges.totals);
const when = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

writeFileSync(at("eval/result.json"), JSON.stringify({ when, ruleVersion: GRADE_RULE_VERSION, ...score, edges, overall }, null, 2) + "\n");
const o = overall;
const overallLine = `\n## 전체 (등급 사례 + 경계 사례)\n\n- 사례 ${o.cases} · 맞게 울림 ${o.hit} · 맞게 조용함 ${o.quietOk} · **놓침 ${o.miss}** · **잘못 울림 ${o.falseAlarm}** · **결과 다름 ${o.outcomeWrong}** · 실행 실패 ${o.failed}\n`;
writeFileSync(at("eval/result.md"), toMarkdown(score, { when, ruleVersion: GRADE_RULE_VERSION }) + "\n" + edgeMarkdown(edges) + overallLine);
const t = score.totals;
console.log(`채점 끝: 등급 사례 ${t.cases} · 놓침 ${t.miss} · 잘못 울림 ${t.falseAlarm} · 등급 맞음 ${t.gradeOk}/${t.cases}`);
console.log(`경계 사례 ${edges.totals.cases} · 놓침 ${edges.totals.miss} · 잘못 울림 ${edges.totals.falseAlarm} · 결과 다름 ${edges.totals.outcomeWrong} · 실행 실패 ${edges.totals.failed} → eval/result.md`);
