// 저장소의 스킬 폴더(.claude/skills/<이름>/) → 내 기술(SPEC-7.3, PRD-F6). 네트워크·DB를 모르는 순수 규칙. 주인: 김영식 A.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { parseGithubRepo, type FoundTech } from "./manifest.ts";
import { skillKey } from "./tech-key.ts";

export const SKILLS_DIR = ".claude/skills";
export const SKILL_FILE = "SKILL.md";

const validName = (name: string): boolean => name !== "." && name !== ".." && !name.includes("/") && !/[\u0000-\u001f]/.test(name);

/** GitHub contents API가 돌려준 목록(JSON) → 폴더 이름들(이름순). 목록이 아니면 null(오류 메시지 객체·파일 하나 등: 호출한 쪽이 수집 오류로 남긴다). */
export function skillFolderNames(json: string): string[] | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  return data
    .filter((e): e is { type: string; name: string } => typeof e === "object" && e !== null && (e as { type?: unknown }).type === "dir" && typeof (e as { name?: unknown }).name === "string")
    .map((e) => e.name)
    .filter(validName)
    .sort();
}

// shortcut: 원본 주소는 SKILL.md 머리(frontmatter)의 아래 키에 적힌 GitHub 저장소 주소만 인정한다. 본문의 링크는 원본이라는 뜻이 아닐 수 있어 보지 않는다.
// 그 밖의 스킬은 "출처 모름"이 된다(SPEC-7.3). 머리 말고 README까지 보려면 요청이 하나 더 든다.
const ORIGIN_KEYS = ["source", "repository", "repo", "homepage", "github"];

/** SKILL.md 머리에서 원본 저장소를 찾는다. 없거나 GitHub 주소가 아니면 null. */
export function readSkillOrigin(text: string | null): { owner: string; repo: string } | null {
  if (text === null) return null;
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^﻿/, ""));
  if (!head) return null;
  for (const line of head[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (!kv || !ORIGIN_KEYS.includes(kv[1].toLowerCase())) continue;
    const gh = parseGithubRepo(kv[2].trim().replace(/^["']|["']$/g, ""));
    if (gh) return { owner: gh.owner, repo: gh.repo };
  }
  return null;
}

/**
 * 스킬 폴더 하나 → 내 기술. 원본을 알면 `skill:<원본 owner>/<repo>/<이름>`, 모르면 내 저장소의 것으로 두고 "출처 모름"을 켠다
 * (다른 사람의 같은 이름 스킬과 묶이지 않게, SPEC-7.3).
 */
export function skillFromFolder(folder: string, skillMd: string | null, mine: { owner: string; repo: string }): FoundTech {
  const origin = readSkillOrigin(skillMd);
  const from = origin ?? mine;
  return { tech: skillKey(from.owner, from.repo, folder), name: folder, type: "skill", sourceFile: `${SKILLS_DIR}/${folder}`, unknownOrigin: origin === null };
}
