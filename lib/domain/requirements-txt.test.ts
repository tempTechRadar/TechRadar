// requirements.txt 읽기(PRD-F6, SPEC-7.1~7.3). 허용 목록의 PyPI 패키지만 `pypi:<이름>` 키로 넣고, ==로 고정한 버전만 버전으로 본다.
// 이 파일은 사용자가 고른 공개 저장소의 것이라 믿을 수 없다: 줄이 아무리 길어도 오래 걸리면 안 되고(정규식 폭주), 못 읽는 파일은 "없음"이 아니라 오류다(불변 2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedPypi, readRepoFile, readRequirementsTxt, REPO_FILES, requirementIncludes } from "./manifest.ts";

const summary = (text: string) => readRequirementsTxt(text).map((f) => [f.tech?.key, f.tech?.version, f.type]).sort();

test("허용 목록의 AI 도구만 뽑는다(requests 같은 일반 패키지는 뺀다), 읽은 파일 이름이 붙고, 파이썬 쪽은 모두 sdk다", () => {
  const found = readRequirementsTxt("anthropic==0.40.0\nopenai>=1.0\nrequests==2.31.0\nlangchain-community==0.3.1\nfastmcp==2.0.0\nmcp==1.2.0\nnumpy\n");
  assert.deepEqual(found.map((f) => [f.tech?.key, f.tech?.version, f.type, f.sourceFile]).sort(), [
    ["pypi:anthropic", "0.40.0", "sdk", "requirements.txt"],
    ["pypi:fastmcp", "2.0.0", "sdk", "requirements.txt"], // 라이브러리이지 설치할 서버가 아니다(npm의 @modelcontextprotocol/sdk도 sdk)
    ["pypi:langchain-community", "0.3.1", "sdk", "requirements.txt"],
    ["pypi:mcp", "1.2.0", "sdk", "requirements.txt"],
    ["pypi:openai", null, "sdk", "requirements.txt"],
  ]);
});

test("PyPI 이름은 대소문자와 - _ .를 같게 보고(PEP 503), [extras]와 ==의 공백은 무시한다", () => {
  assert.deepEqual(summary("Anthropic[bedrock]==0.40.0\nlangchain_core==0.3.0\nlangchain_openai == 0.2.0\nLiteLLM==1.50.0"), [
    ["pypi:anthropic", "0.40.0", "sdk"],
    ["pypi:langchain-core", "0.3.0", "sdk"],
    ["pypi:langchain-openai", "0.2.0", "sdk"],
    ["pypi:litellm", "1.50.0", "sdk"],
  ]);
});

test("주석·빈 줄·옵션·주소·VCS·로컬 경로는 기술이 아니고, 환경 표식·끝 주석·같은 줄 옵션·해시 이음줄은 떼고 읽는다", () => {
  const text = [
    "# 주석", "#anthropic==0.1.0", "", "-r base.txt", "-e .", "--index-url https://pypi.example/simple",
    "git+https://github.com/x/anthropic.git#egg=anthropic", "https://example.com/openai-1.0.tar.gz", "./local/openai",
    "openai://not-a-package", "openai @ https://example.com/openai-1.0-py3-none-any.whl",
    "openai @ ./vendor/openai-1.0-py3-none-any.whl", "openai @ file:vendor.whl", "anthropic/subdir", "langchain_==1.0", // 주소가 아니어도 직접 참조·경로·이름 아닌 모양
    'openai==1.30.0 ; python_version >= "3.9"', "fastmcp==2.0.0  # 끝 주석", "mcp==1.2.0 \\", "    --hash=sha256:abc",
    "litellm==1.50.0 --hash=sha256:aaa --hash=sha256:bbb", // pip 해시 검사 형식: 같은 줄에 옵션이 붙는다
  ].join("\n");
  assert.deepEqual(summary(text), [
    ["pypi:fastmcp", "2.0.0", "sdk"],
    ["pypi:litellm", "1.50.0", "sdk"],
    ["pypi:mcp", "1.2.0", "sdk"],
    ["pypi:openai", "1.30.0", "sdk"],
  ]);
});

test("버전: ==로 딱 하나 고정했을 때만 버전(PEP 440 꼴), 범위·와일드카드·여러 조건·===은 모르는 것(null)", () => {
  const text = ["anthropic==1.2.*", "openai~=1.2", "mcp==1.2.3.post1", "fastmcp===1.0.0", "litellm==2.0.0rc1", "langgraph==1.0", "crewai==1.0,<2"].join("\n");
  assert.deepEqual(summary(text), [
    ["pypi:anthropic", null, "sdk"],
    ["pypi:crewai", null, "sdk"],
    ["pypi:fastmcp", null, "sdk"],
    ["pypi:langgraph", "1.0", "sdk"],
    ["pypi:litellm", "2.0.0rc1", "sdk"],
    ["pypi:mcp", "1.2.3.post1", "sdk"],
    ["pypi:openai", null, "sdk"],
  ]);
  // 사전 배포·구분자가 다른 쓰기도 고정 버전이다(알아보지 못하면 모든 버전을 묻게 되어 등급이 틀어진다)
  for (const version of ["1.0.0-rc1", "1.0.0.rc1", "1.0.0c1", "1.0.0alpha1", "1.0.0RC1", "2.0.0.post1.dev0", "1.0.0+local.1"]) {
    assert.equal(readRequirementsTxt(`openai==${version}`)[0].tech?.version, version, version);
  }
  // 깨진 모양·epoch(`1!2.0`: cmpVersion이 비교하지 못함)·설치 안내가 받지 않는 글자는 버전을 모르는 것
  for (const version of ["1.0.0.", "1..0", "1.0.0+", "1!2.0", "1.0_post1", "v1.0", "1".repeat(65)]) {
    const [found] = readRequirementsTxt(`openai==${version}`);
    assert.deepEqual([found.tech?.key, found.tech?.version], ["pypi:openai", null], version);
  }
});

test("패키지 이름은 100자까지, 영숫자로 시작하고 끝나야 한다(langchain-* 에 아무 긴 글이나 공용 카탈로그에 오르지 않게)", () => {
  assert.deepEqual(summary(`langchain-${"x".repeat(200)}==1.0\nlangchain-==1.0\nlangchain-x==1.0`), [["pypi:langchain-x", "1.0", "sdk"]]);
});

test("CRLF·낱개 CR(옛 맥 줄바꿈)·BOM·빈 파일·읽을 수 없는 줄이 섞여도 던지지 않고 읽을 수 있는 것만 읽는다", () => {
  assert.deepEqual(summary("﻿openai==1.0.0\r\nmcp==1.2.0\r\n"), [["pypi:mcp", "1.2.0", "sdk"], ["pypi:openai", "1.0.0", "sdk"]]);
  assert.deepEqual(summary("openai==1.0.0\rmcp==1.2.0"), [["pypi:mcp", "1.2.0", "sdk"], ["pypi:openai", "1.0.0", "sdk"]]);
  assert.deepEqual(readRequirementsTxt(""), []);
  assert.deepEqual(readRequirementsTxt("??? \n==1.0\n[]\n@@@\n"), []);
});

test("글자가 아닌 파일(UTF-16 등, NUL이 섞임)은 '기술 없음'이 아니라 던진다 — 호출한 쪽이 수집 오류로 남긴다(불변 2)", () => {
  assert.throws(() => readRequirementsTxt("o\u0000p\u0000e\u0000n\u0000a\u0000i\u0000=\u0000=\u00001\u0000"), /텍스트/);
});

test("-r·--requirement가 가리키는 다른 파일을 알려 준다(-c는 제약일 뿐이라 기술을 더하지 않으므로 뺀다)", () => {
  assert.deepEqual(requirementIncludes("-r base.txt\n--requirement=dev/req.txt\n--requirement other.txt\n-c constraints.txt\nopenai==1.0\n# -r commented.txt"), ["base.txt", "dev/req.txt", "other.txt"]);
  assert.deepEqual(requirementIncludes("openai==1.0\n"), []);
});

test("믿을 수 없는 입력: 아무리 긴 줄·공백 폭탄·낱개 CR이 섞여도 오래 걸리지 않는다(정규식 폭주 방지)", () => {
  const started = performance.now();
  readRequirementsTxt("openai==1.0" + " ".repeat(200_000) + "x");
  readRequirementsTxt("a" + " ".repeat(50_000) + "b\rc");
  readRequirementsTxt(("anthropic==1.0 " + " ".repeat(250) + "x\n").repeat(1_000));
  readRequirementsTxt("a".repeat(500_000));
  requirementIncludes("-r " + " ".repeat(400_000) + "x");
  // 옛 정규식은 여기서 80초가 넘었다. 느린 실행기에서도 흔들리지 않게 넉넉히 잡는다
  assert.ok(performance.now() - started < 3_000, `너무 오래 걸림: ${(performance.now() - started).toFixed(0)}ms`);
});

test("허용 목록(SPEC-7.2 PyPI 14개): 이름이 같거나 langchain- 로 시작할 때만", () => {
  for (const name of ["anthropic", "claude-agent-sdk", "openai", "openai-agents", "mcp", "fastmcp", "langchain", "langchain-community", "langgraph", "llama-index", "crewai", "autogen-agentchat", "google-genai", "litellm", "OpenAI", "LangChain_Core"]) {
    assert.equal(isAllowedPypi(name), true, name);
  }
  for (const name of ["requests", "numpy", "langchainx", "mcp-server-fetch", "openai-whisper", ""]) assert.equal(isAllowedPypi(name), false, name);
});

test("읽는 파일은 package.json 다음 .mcp.json, requirements.txt 순서(같은 기술은 앞 파일 우선)이고, 파일 이름으로 알맞은 해석기를 고른다", () => {
  assert.deepEqual([...REPO_FILES], ["package.json", ".mcp.json", "requirements.txt"]);
  assert.equal(readRepoFile("requirements.txt", "openai==1.0.0")[0].tech?.key, "pypi:openai");
  assert.equal(readRepoFile("package.json", '{"dependencies":{"mcp-remote":"0.1.15"}}')[0].tech?.key, "npm:mcp-remote");
  assert.equal(readRepoFile(".mcp.json", '{"mcpServers":{"a":{"command":"uvx","args":["mcp-server-fetch"]}}}')[0].tech?.key, "pypi:mcp-server-fetch");
  assert.throws(() => readRepoFile("모르는.txt", ""), /모르는\.txt/);
});
