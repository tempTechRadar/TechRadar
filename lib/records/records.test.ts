// 기록 문서(intent·worklog 등)가 합쳐진 뒤에도 멀쩡한지 본다(ADR 0017).
// `.gitattributes`의 merge=union은 충돌 표시를 없애는 대신 "같은 번호가 조용히 두 번 생기는 것"을 가릴 수 있어서, 여기서 잡는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const APPEND_ONLY = ["docs/intent.md", "docs/worklog.md", "docs/agents.md", "docs/connectors.md", "docs/debug-note.md"];
const TABLE_DOCS = ["docs/worklog.md", "docs/agents.md", "docs/connectors.md", "docs/debug-note.md"];

const duplicates = (items: string[]) => [...new Set(items.filter((x, i) => items.indexOf(x) !== i))];

/** `## I-…` 제목의 작업 ID 목록 */
const intentIds = (text: string) => [...text.matchAll(/^## (I-\S+)/gm)].map((m) => m[1]);

/** docs/adr 파일 이름 앞의 번호(0001…) */
const adrNumbers = () => readdirSync("docs/adr").map((f) => f.slice(0, 4)).filter((n) => /^\d{4}$/.test(n));

/** 표마다 줄 목록(머리·구분선 포함). 표는 `|`로 시작하는 연속된 줄. */
function tables(text: string): string[][] {
  const out: string[][] = [];
  let cur: string[] | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("|")) (cur ??= []).push(line);
    else if (cur) (out.push(cur), (cur = null));
  }
  if (cur) out.push(cur);
  return out;
}

// GitHub 표(GFM) 규칙: 칸은 이스케이프(\|) 안 한 |로 갈린다(코드 안의 |도). 줄 앞뒤의 | 는 있어도 없어도 된다(칸 수 계산만 그렇다. 표를 찾는 tables는 줄이 | 로 시작하고 구분선 끝에 | 가 있다고 본다)
const columns = (line: string) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).length;
const firstCell = (line: string) => line.split("|")[1].trim();

/** 머리가 "시간 순"인 표에서 첫 칸(번호·작업 ID)이 겹치는 것 */
function worklogDuplicates(text: string): string[] {
  return tables(text)
    .filter((t) => firstCell(t[0]) === "시간 순")
    .flatMap((t) => duplicates(t.slice(2).map(firstCell)));
}

/** 머리와 구분선(|---|)이 없는 표 덩어리 = 표 밖에 떨어진 행. 파일 끝에 행을 덧붙이다 표 뒤 문단 밑으로 가면 생긴다. */
const strayRows = (text: string) => tables(text).filter((t) => t.length < 2 || !/^\|[\s:|-]+\|$/.test(t[1])).map((t) => t[0].slice(0, 40));

const wrongColumns = (text: string) => tables(text).flatMap((t) => t.filter((l) => columns(l) !== columns(t[0])).map((l) => l.slice(0, 40)));

test("docs 문서에 충돌 표시(<<<<<<<·>>>>>>>)가 남아 있지 않다", () => {
  const files = readdirSync("docs", { recursive: true }).map(String).filter((f) => f.endsWith(".md"));
  const marked = files.filter((f) => /^(<<<<<<< |>>>>>>> )/m.test(read(`docs/${f}`)));
  assert.deepEqual(marked, []);
});

test("intent.md의 작업 ID(## I-…)가 겹치지 않는다(합치다가 같은 번호가 두 번 생기면 여기서 걸린다)", () => {
  assert.deepEqual(duplicates(intentIds(read("docs/intent.md"))), []);
});

test("ADR 번호가 겹치지 않는다(두 PR이 같은 번호로 파일을 만들면 이름이 달라 git은 충돌로 보지 않으므로 여기서 잡는다)", () => {
  assert.deepEqual(duplicates(adrNumbers()), []);
});

test("worklog.md 표마다 첫 칸(번호·작업 ID)이 겹치지 않는다", () => {
  assert.deepEqual(worklogDuplicates(read("docs/worklog.md")), []);
});

test("기록 표의 열 수가 줄마다 같다(두 브랜치의 행이 섞여도 표가 깨지지 않음)", () => {
  for (const f of TABLE_DOCS) assert.deepEqual(wrongColumns(read(f)), [], f);
});

test("기록 표는 머리·구분선이 있는 한 덩어리다(표 밖에 떨어진 행이 없다)", () => {
  for (const f of TABLE_DOCS) assert.deepEqual(strayRows(read(f)), [], f);
});

test(".gitattributes가 기록 문서에 merge=union을 건다(지워지면 충돌이 다시 늘어난다)", () => {
  const attrs = read(".gitattributes");
  for (const f of APPEND_ONLY) assert.match(attrs, new RegExp(`^${f.replace(".", "\\.")} merge=union$`, "m"), f);
});

test("검사 함수가 실제로 겹침·깨진 표를 잡는다", () => {
  assert.deepEqual(intentIds("## I-043 · a\n\n---\n\n## I-043 · b\n\n## I-P-3-x · c"), ["I-043", "I-043", "I-P-3-x"]);
  assert.deepEqual(duplicates(["a", "b", "a", "a"]), ["a"]);
  const worklog = "| 시간 순 | 한 일 |\n|---|---|\n| 83 | x |\n| 83 | y |\n| I-new | z |\n\n| 다른 표 | 값 |\n|---|---|\n| 1 | a |\n| 1 | b |";
  assert.deepEqual(worklogDuplicates(worklog), ["83"], "머리가 시간 순인 표만 본다");
  assert.deepEqual(strayRows("| a | b |\n|---|---|\n| 1 | 2 |\n\n설명 문단\n\n| 3 | 4 |"), ["| 3 | 4 |"], "문단 밑에 떨어진 행");
  assert.deepEqual(wrongColumns("| a | b |\n|---|---|\n| 1 | 2 | 3 |"), ["| 1 | 2 | 3 |"], "칸이 넘치면 잡는다");
  assert.deepEqual(wrongColumns("| a | b |\n|---|---|\n| `x|y` | 2 |"), ["| `x|y` | 2 |"], "코드 안의 |도 칸을 가른다(쓰려면 \\|)");
  assert.deepEqual(wrongColumns("| a | b |\n|---|---|\n| `x\\|y` | 2 |\n| 1 | 2"), [], "이스케이프한 \\|와 맨 끝 |가 없는 행은 정상");
});
