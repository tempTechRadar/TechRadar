// 열린 PR 브랜치에 main을 자동으로 합치는 스크립트(.github/scripts/sync-pr-branches.sh)를 임시 저장소로 시험한다(ADR 0017 개정).
// GitHub Action 자체는 합친 뒤에야 돌려 볼 수 있어서, 합치는 규칙(union 적용·충돌 중단·이름 거르기·시험 실행)만 여기서 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = resolve(".github/scripts/sync-pr-branches.sh").replace(/\\/g, "/");
// 윈도우의 WSL bash는 이 경로를 못 찾는다. 스크립트를 읽고 git이 되는 bash만 쓴다.
const canRun = spawnSync("bash", ["-c", 'test -f "$1" && git --version', "_", SCRIPT]).status === 0;
const skip = canRun ? false : "bash와 git이 있는 환경에서만 시험한다(윈도우는 Git Bash)";

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}\n${r.stdout}${r.stderr}`);
  return r.stdout.trim();
}

function commit(cwd: string, message: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(cwd, name, ".."), { recursive: true });
    writeFileSync(join(cwd, name), text);
  }
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
}

const intent = (...entries: string[]) => `# intent\n\n---\n\n${entries.map((e) => `## ${e}\n`).join("")}## I-old\n`;

function configure(repo: string): void {
  for (const [k, v] of [["user.name", "t"], ["user.email", "t@t"], ["core.autocrlf", "false"]]) git(repo, "config", k, v);
}

/** origin(bare)과 PR 브랜치 5개를 만든다. 브랜치 이름 → 푸시 전 SHA를 돌려준다. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "sync-pr-"));
  const origin = join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  const dev = join(root, "dev");
  git(root, "clone", "-q", "-c", "core.autocrlf=false", origin, dev);
  configure(dev);

  // main M0: .gitattributes가 아직 없다(옛 브랜치가 갈라져 나온 시점)
  commit(dev, "M0", { "docs/intent.md": intent(), "src.txt": "a\nb\nc\n" });
  git(dev, "push", "-q", "origin", "main");
  for (const [name, files] of [
    ["feat/noattr", { "docs/intent.md": intent("I-noattr") }],
    ["feat/conflict", { "src.txt": "a\nbranch\nc\n" }],
    ["test/other", { "other.txt": "x\n" }],
  ] as const) {
    git(dev, "checkout", "-q", "-b", name, "main");
    commit(dev, name, files);
    git(dev, "push", "-q", "origin", name);
  }
  // main M1: 같은 자리에 기록을 덧붙이고, union 설정을 넣고, src.txt 같은 줄을 고친다
  git(dev, "checkout", "-q", "main");
  commit(dev, "M1", { ".gitattributes": "docs/intent.md merge=union\n", "docs/intent.md": intent("I-main"), "src.txt": "a\nmain\nc\n" });
  git(dev, "push", "-q", "origin", "main");
  git(dev, "checkout", "-q", "-b", "feat/current", "main");
  commit(dev, "current", { "other2.txt": "y\n" });
  git(dev, "push", "-q", "origin", "feat/current");

  const heads = Object.fromEntries(
    ["feat/noattr", "feat/conflict", "test/other", "feat/current"].map((b) => [b, git(origin, "rev-parse", b)]),
  );
  const runner = join(root, "runner");
  git(root, "clone", "-q", "-c", "core.autocrlf=false", origin, runner);
  configure(runner);
  return { root, origin, runner, heads, mainSha: git(origin, "rev-parse", "main") };
}

function sync(runner: string, env: Record<string, string> = {}) {
  const input = "1 feat/noattr\n2 feat/conflict\n3 feat/current\n4 test/other\n";
  const r = spawnSync("bash", [SCRIPT], { cwd: runner, input, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("union이 없는 옛 브랜치는 합쳐 푸시하고, 충돌·이미 최신·이름 밖 브랜치는 건드리지 않는다", { skip }, () => {
  const s = setup();
  try {
    const r = sync(s.runner);
    assert.equal(r.status, 0, r.out);

    // 옛 브랜치: main의 union 설정이 적용돼 기록 문서 양쪽 줄이 모두 남고, main이 들어 있다
    assert.notEqual(git(s.origin, "rev-parse", "feat/noattr"), s.heads["feat/noattr"], "푸시됐어야 함");
    const text = git(s.origin, "show", "feat/noattr:docs/intent.md");
    assert.match(text, /## I-main/);
    assert.match(text, /## I-noattr/);
    assert.equal(spawnSync("git", ["merge-base", "--is-ancestor", s.mainSha, "feat/noattr"], { cwd: s.origin }).status, 0);

    // 진짜 충돌: 푸시 안 함, 파일 이름을 알려 줌, 러너에 합치다 만 상태가 남지 않음
    assert.equal(git(s.origin, "rev-parse", "feat/conflict"), s.heads["feat/conflict"]);
    assert.match(r.out, /#2 feat\/conflict: .*충돌 파일: src\.txt/);
    assert.equal(git(s.runner, "status", "--porcelain"), "");

    assert.equal(git(s.origin, "rev-parse", "feat/current"), s.heads["feat/current"]);
    assert.match(r.out, /#3 feat\/current: 이미 최신/);
    assert.equal(git(s.origin, "rev-parse", "test/other"), s.heads["test/other"]);
    assert.match(r.out, /#4 test\/other: 건드리지 않음/);
    assert.match(r.out, /합침 1 · 이미 최신 1 · 건너뜀 1 · 충돌 1 · 실패 0/);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("DRY_RUN=true면 합쳐 보기만 하고 아무 브랜치도 푸시하지 않는다", { skip }, () => {
  const s = setup();
  try {
    const r = sync(s.runner, { DRY_RUN: "true" });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /#1 feat\/noattr: 합쳐짐\(시험이라 푸시 안 함\)/);
    for (const [branch, sha] of Object.entries(s.heads)) assert.equal(git(s.origin, "rev-parse", branch), sha, `${branch}가 바뀌면 안 됨`);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("푸시 직전에 작성자가 새 커밋을 올렸으면 덮어쓰지 않고 거절된다", { skip }, () => {
  const s = setup();
  try {
    // 러너가 브랜치를 받은 뒤 push 하기 전에 원격이 앞서가는 상황을 흉내 낸다: 원격에 새 커밋을 만든 뒤 러너는 옛 SHA에서 시작
    const late = join(s.root, "late");
    git(s.root, "clone", "-q", "-c", "core.autocrlf=false", s.origin, late);
    configure(late);
    git(late, "checkout", "-q", "feat/noattr");
    commit(late, "작성자가 방금 올림", { "late.txt": "z\n" });
    // 러너의 pre-push 훅으로 "fetch 이후, push 이전"에 이 커밋을 올린다
    const hooks = join(s.runner, ".git", "hooks");
    // 훅은 러너 저장소의 GIT_DIR 등을 물려받으므로 비우고 late 저장소에서 푸시한다
    writeFileSync(join(hooks, "pre-push"), `#!/bin/sh\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ngit -C "${late.replace(/\\/g, "/")}" push -q origin feat/noattr\nexit 0\n`, { mode: 0o755 });
    const r = sync(s.runner);
    assert.match(r.out, /#1 feat\/noattr: 푸시 거절/);
    const remote = git(s.origin, "show", "feat/noattr:late.txt");
    assert.equal(remote, "z", "작성자의 커밋이 살아 있어야 함");
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});
