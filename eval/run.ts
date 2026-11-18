// 채점 스크립트: `npm run eval` → eval/result.json, eval/result.md. 네트워크·DB를 쓰지 않는다(저장된 OSV 응답과 시험용 스킬만).
// 실행 기록(runs·run_steps)에 남기는 일은 lib/eval/record.ts가 맡고, 서비스 키가 필요해 이 스크립트에서는 부르지 않는다.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { GRADE_RULE_VERSION } from "../lib/domain/grade.ts";
import { computeActual, type Reader } from "../lib/eval/actual.ts";
import { scoreCases, toMarkdown, type GoldCase } from "../lib/eval/score.ts";

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

const gold = (JSON.parse(readFileSync(at("eval/gold.json"), "utf8")) as { cases: GoldCase[] }).cases;
const score = scoreCases(gold, gold.map((c) => computeActual(c, reader)));
const when = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

writeFileSync(at("eval/result.json"), JSON.stringify({ when, ruleVersion: GRADE_RULE_VERSION, ...score }, null, 2) + "\n");
writeFileSync(at("eval/result.md"), toMarkdown(score, { when, ruleVersion: GRADE_RULE_VERSION }));
const t = score.totals;
console.log(`채점 끝: 사례 ${t.cases} · 놓침 ${t.miss} · 잘못 울림 ${t.falseAlarm} · 등급 맞음 ${t.gradeOk}/${t.cases} → eval/result.md`);
