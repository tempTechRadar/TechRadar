import { test } from "node:test";
import assert from "node:assert/strict";
import { readSkillOrigin, skillFolderNames, skillFromFolder } from "./skills.ts";

const MINE = { owner: "Me", repo: "My-Repo" };
const listing = (...entries: unknown[]) => JSON.stringify(entries);

test("폴더 목록: 폴더만, 이름순으로", () => {
  assert.deepEqual(
    skillFolderNames(listing({ type: "dir", name: "b-skill" }, { type: "file", name: "README.md" }, { type: "dir", name: "a-skill" })),
    ["a-skill", "b-skill"],
  );
  assert.deepEqual(skillFolderNames("[]"), []);
});

test("폴더 목록: 목록이 아니면 null(없다고 하지 않고 호출한 쪽이 수집 오류로 남긴다)", () => {
  assert.equal(skillFolderNames('{"message":"Not Found"}'), null); // 오류 객체
  assert.equal(skillFolderNames('{"type":"file","name":"x"}'), null); // 폴더 대신 파일 하나
  assert.equal(skillFolderNames("<html>"), null);
  assert.equal(skillFolderNames(""), null);
});

test("폴더 목록: 경로를 흉내 내거나 모양이 이상한 항목은 뺀다", () => {
  const raw = listing({ type: "dir", name: "ok" }, { type: "dir", name: ".." }, { type: "dir", name: "a/b" }, { type: "dir" }, { type: "dir", name: 3 }, null, "x");
  assert.deepEqual(skillFolderNames(raw), ["ok"]);
});

test("원본: 머리의 source·repository 같은 키에 GitHub 주소가 있으면 그것", () => {
  assert.deepEqual(readSkillOrigin("---\nname: pdf\nsource: https://github.com/anthropics/skills\n---\n본문"), { owner: "anthropics", repo: "skills" });
  assert.deepEqual(readSkillOrigin("---\r\nrepository: \"https://github.com/o/r.git\"\r\n---\r\n"), { owner: "o", repo: "r" });
  assert.deepEqual(readSkillOrigin("---\nHomepage: 'https://github.com/o/r/tree/main/skills/x'\n---"), { owner: "o", repo: "r" });
  assert.deepEqual(readSkillOrigin("﻿---\ngithub: https://github.com/o/r\n---"), { owner: "o", repo: "r" });
});

test("원본: 본문 링크·다른 사이트·키 없음·머리 없음은 모두 모름(null)", () => {
  assert.equal(readSkillOrigin("---\nname: x\n---\n참고: https://github.com/o/r"), null); // 본문 링크는 원본이라는 뜻이 아니다
  assert.equal(readSkillOrigin("---\nsource: https://gitlab.com/o/r\n---"), null);
  assert.equal(readSkillOrigin("---\nsource: https://github.com/only-owner\n---"), null);
  assert.equal(readSkillOrigin("---\nname: x\ndescription: https://github.com/o/r\n---"), null); // 원본 키가 아님
  assert.equal(readSkillOrigin("source: https://github.com/o/r"), null); // 머리(---)가 없음
  assert.equal(readSkillOrigin(""), null);
  assert.equal(readSkillOrigin(null), null);
});

test("스킬 하나 → 기술: 원본을 알면 원본 키, 모르면 내 저장소 키와 출처 모름", () => {
  assert.deepEqual(skillFromFolder("pdf", "---\nsource: https://github.com/Anthropics/Skills\n---", MINE), {
    tech: { key: "skill:anthropics/skills/pdf", version: null },
    name: "pdf",
    type: "skill",
    sourceFile: ".claude/skills/pdf",
    unknownOrigin: false,
  });
  assert.deepEqual(skillFromFolder("my-helper", "---\nname: my-helper\n---", MINE), {
    tech: { key: "skill:me/my-repo/my-helper", version: null },
    name: "my-helper",
    type: "skill",
    sourceFile: ".claude/skills/my-helper",
    unknownOrigin: true,
  });
  assert.equal(skillFromFolder("x", null, MINE).unknownOrigin, true);
});

test("같은 이름 스킬도 내 저장소가 다르면 키가 달라 다른 사람 것과 묶이지 않는다", () => {
  const a = skillFromFolder("deploy", null, { owner: "a", repo: "one" }).tech!.key;
  const b = skillFromFolder("deploy", null, { owner: "b", repo: "two" }).tech!.key;
  assert.notEqual(a, b);
});
