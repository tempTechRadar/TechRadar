// 저장소의 스킬 폴더 읽기(P-9e, PRD-F6). 폴더 목록 1번(GitHub API) + 폴더마다 SKILL.md(raw). 주인: 김영식 A.
// 실패는 오류 종류로 나눠 돌려준다: "스킬이 없다"(폴더 없음)와 "못 읽었다"는 다르다(불변 2).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { FoundTech } from "../domain/manifest.ts";
import { SKILLS_DIR, SKILL_FILE, skillFolderNames, skillFromFolder } from "../domain/skills.ts";
import { CollectError, errorKindOf, fetchText, type ErrorKind } from "./collect-fetch.ts";

// shortcut: 읽기 한 번에 스킬 30개까지. 폴더마다 SKILL.md 요청이 하나씩 들고 요청 사이 간격은 두지 않는다. 그 넘는 폴더가 흔해지면 한도와 간격을 함께 손본다.
const MAX_SKILLS = 30;

export type SkillError = { path: string; kind: ErrorKind; message: string };
export type SkillRead = { found: FoundTech[]; errors: SkillError[]; folders: number };

const messageOf = (e: unknown) => String(e instanceof Error ? e.message : e);

export async function readSkills(repo: { owner: string; repo: string }): Promise<SkillRead> {
  const out: SkillRead = { found: [], errors: [], folders: 0 };
  const o = encodeURIComponent(repo.owner);
  const r = encodeURIComponent(repo.repo);
  let names: string[];
  try {
    const listing = await fetchText(`https://api.github.com/repos/${o}/${r}/contents/${SKILLS_DIR}`, { headers: { Accept: "application/vnd.github+json" } });
    if (listing === null) return out; // 폴더가 없다 = 읽은 스킬이 없다(저장소가 안 열린 경우는 파일 읽기 쪽이 먼저 구분한다)
    const parsed = skillFolderNames(listing);
    if (parsed === null) throw new CollectError("parse", `${SKILLS_DIR}: 폴더 목록의 모양이 달라 해석하지 못함`);
    names = parsed;
  } catch (e) {
    out.errors.push({ path: SKILLS_DIR, kind: errorKindOf(e), message: messageOf(e) });
    return out;
  }
  out.folders = names.length;
  // 앞의 일부만 읽었으면 "전부"라고 하지 않는다: 스킬 줄 전체를 수집 오류로 남긴다
  if (names.length > MAX_SKILLS) out.errors.push({ path: SKILLS_DIR, kind: "parse", message: `스킬 폴더가 ${names.length}개라 앞의 ${MAX_SKILLS}개만 읽음` });
  for (const name of names.slice(0, MAX_SKILLS)) {
    try {
      const md = await fetchText(`https://raw.githubusercontent.com/${o}/${r}/HEAD/${SKILLS_DIR}/${encodeURIComponent(name)}/${SKILL_FILE}`);
      if (md === null) continue; // SKILL.md가 없는 폴더는 스킬이 아니다
      out.found.push(skillFromFolder(name, md, repo));
    } catch (e) {
      out.errors.push({ path: `${SKILLS_DIR}/${name}`, kind: errorKindOf(e), message: messageOf(e) });
    }
  }
  return out;
}
