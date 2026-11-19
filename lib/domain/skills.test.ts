import { test } from "node:test";
import assert from "node:assert/strict";
import { skillFolderNames, skillFromFolder } from "./skills.ts";

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

test("스킬 하나 → 기술: 늘 내 저장소 키와 출처 모름(머리의 원본 주소는 누구나 적을 수 있어 믿지 않는다)", () => {
  assert.deepEqual(skillFromFolder("my-helper", MINE), {
    tech: { key: "skill:me/my-repo/my-helper", version: null },
    name: "my-helper",
    type: "skill",
    sourceFile: ".claude/skills/my-helper",
    unknownOrigin: true,
  });
});

test("같은 이름 스킬도 내 저장소가 다르면 키가 달라 다른 사람 것과 묶이지 않는다", () => {
  const a = skillFromFolder("deploy", { owner: "a", repo: "one" }).tech!.key;
  const b = skillFromFolder("deploy", { owner: "b", repo: "two" }).tech!.key;
  assert.notEqual(a, b);
});
