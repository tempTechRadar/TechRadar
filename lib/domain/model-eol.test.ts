import { test } from "node:test";
import assert from "node:assert/strict";
import { codeFilesOf, eolOfKey, findEolModels, LIST_FILE_MODELS, MAX_CODE_FILES, MODEL_EOL, modelFound } from "./model-eol.ts";

test("공식 표: 날짜는 실제 있는 날, 출처는 공식 https 주소, 대체가 비어 있지 않다", () => {
  assert.ok(MODEL_EOL.size > 100);
  for (const n of MODEL_EOL.values()) {
    assert.match(n.retireOn, /^\d{4}-\d{2}-\d{2}$/, n.model);
    assert.equal(new Date(`${n.retireOn}T00:00:00Z`).toISOString().slice(0, 10), n.retireOn, n.model);
    assert.match(n.source, /^https:\/\/(platform\.claude\.com|developers\.openai\.com|aistudio\.google\.com)\//, n.model);
    assert.ok(n.replacement.length > 0, n.model);
  }
});

test("문자열로 쓴 모델 이름만 찾는다: 주석 · 문서의 말, 더 긴 이름의 앞부분은 아니다", () => {
  const code = [
    `const a = "claude-3-opus-20240229";`,
    `model: 'gpt-4o-2024-05-13',`,
    "genai.getGenerativeModel({ model: `models/gemini-2.0-flash` })",
    `// 예전엔 o1을 썼다, GPT-4도`,
    `const b = "gpt-4o"; const c = "claude-3-opus-20240229-v1:0"; const d = "gpt-4-turbo-2024-04-09x";`,
    `const again = "claude-3-opus-20240229";`,
  ].join("\n");
  assert.deepEqual(findEolModels(code).map((n) => n.model), ["claude-3-opus-20240229", "gpt-4o-2024-05-13", "gemini-2.0-flash"]);
  assert.deepEqual(findEolModels(`"claude-sonnet-5-5" "gpt-6-sol"`), [], "지원 중인 모델은 알림거리가 아니다");
});

test("모델은 기술 키 model:<이름>, 종류 model, 찾은 파일을 남긴다", () => {
  const n = MODEL_EOL.get("claude-3-opus-20240229")!;
  const f = modelFound(n, "src/ai.ts");
  assert.deepEqual(f, { tech: { key: "model:claude-3-opus-20240229", version: null }, name: "claude-3-opus-20240229", type: "model", sourceFile: "src/ai.ts" });
  assert.equal(eolOfKey(f.tech!.key), n);
  assert.equal(eolOfKey("npm:claude-3-opus-20240229"), undefined);
});

test("코드 파일 고르기: 의존성 · 빌드 · 잠금 · 시험 · 이미 읽는 파일 · 폴더는 빼고, 모델을 부를 법한 경로부터 얕은 순서로", () => {
  const tree = {
    tree: [
      { path: "src/deep/x.ts", type: "blob", size: 10 },
      { path: "app.py", type: "blob", size: 10 },
      { path: "src/lib/ai/client.ts", type: "blob", size: 10 },
      { path: "node_modules/openai/index.js", type: "blob", size: 10 },
      { path: "web/.next/server.js", type: "blob", size: 10 },
      { path: "package-lock.json", type: "blob", size: 10 },
      { path: "package.json", type: "blob", size: 10 },
      { path: "README.md", type: "blob", size: 10 },
      { path: "tests/ai.py", type: "blob", size: 10 },
      { path: "src/chat.test.ts", type: "blob", size: 10 },
      { path: "src/email.ts", type: "blob", size: 10 },
      { path: "src", type: "tree" },
      { path: ".env.example", type: "blob", size: 10 },
    ],
  };
  const r = codeFilesOf(JSON.stringify(tree), new Set(["package.json"]))!;
  assert.deepEqual([r.paths, r.skipped, r.truncated], [["src/lib/ai/client.ts", ".env.example", "app.py", "src/email.ts", "src/deep/x.ts"], 0, false]);
  assert.equal(r.all.length, 12, "모든 파일 경로(폴더 빼고)는 연동 서비스 · 개념 찾기용으로 따로 돌려준다");
});

test("한도보다 많거나 너무 큰 코드 파일은 '못 본 수'로 센다(조용히 빼지 않음). GitHub가 목록을 잘랐으면 알린다. 모양이 다르면 null", () => {
  const many = { tree: [...Array.from({ length: MAX_CODE_FILES + 5 }, (_, i) => ({ path: `f${i}.ts`, type: "blob", size: 1 })), { path: "big.ts", type: "blob", size: 300_000 }], truncated: true };
  const r = codeFilesOf(JSON.stringify(many))!;
  assert.deepEqual([r.paths.length, r.skipped, r.truncated], [MAX_CODE_FILES, 6, true]);
  assert.equal(codeFilesOf("not json"), null);
  assert.equal(codeFilesOf(`{"tree":{}}`), null);
  assert.equal(codeFilesOf("null"), null);
});

test(`한 파일에 서로 다른 종료 모델이 ${LIST_FILE_MODELS}개 넘으면 부르는 코드가 아니라 목록 · 가격표로 보고 뺀다`, () => {
  const names = [...MODEL_EOL.keys()].slice(0, LIST_FILE_MODELS);
  assert.equal(findEolModels(names.map((n) => `"${n}"`).join(",")).length, LIST_FILE_MODELS);
  const more = [...MODEL_EOL.keys()].slice(0, LIST_FILE_MODELS + 1);
  assert.deepEqual(findEolModels(more.map((n) => `"${n}"`).join(",")), []);
});

test("파일 목록의 unseen: 심볼릭 링크(mode 120000)·서브모듈(commit)·300자 넘는 경로는 내용을 볼 수 없는 항목으로 따로", () => {
  const long = `a/${"d/".repeat(150)}x.sh`;
  const json = JSON.stringify({ tree: [
    { path: "a/run.sh", type: "blob", mode: "120000" }, { path: "a/vendor", type: "commit" }, { path: long, type: "blob" }, { path: "a/ok.sh", type: "blob", mode: "100644" },
  ] });
  assert.deepEqual(codeFilesOf(json)?.unseen, ["a/run.sh", "a/vendor", long]);
});
