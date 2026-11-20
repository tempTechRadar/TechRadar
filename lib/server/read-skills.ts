// 저장소의 스킬 폴더 읽기(P-9e, PRD-F6). 폴더 목록 1번(GitHub API) + 폴더마다 SKILL.md(raw). 주인: 김영식 A.
// 실패는 오류 종류로 나눠 돌려준다: "스킬이 없다"(폴더 없음)와 "못 읽었다"는 다르다(불변 2).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { repoApiUrl } from "../domain/github-repo.ts";
import type { FoundTech } from "../domain/manifest.ts";
import { SKILLS_DIR, SKILL_FILE, skillFolderNames, skillFromFolder } from "../domain/skills.ts";
import { CollectError, errorKindOf, fetchText, messageOf, rawFileUrl, type ErrorKind } from "./collect-fetch.ts";

// shortcut: 읽기 한 번에 스킬 30개까지(폴더마다 SKILL.md 요청 1번, 한꺼번에). 넘는 폴더가 흔해지면 한도와 동시 요청 수를 함께 손본다.
const MAX_SKILLS = 30;

/** onlyUnread = 스킬 폴더 아래에서 이번에 못 읽은 줄만 가리킨다(한도 뒤의 스킬). 없으면 path 하나 또는 폴더 전체 */
export type SkillError = { path: string; kind: ErrorKind; message: string; onlyUnread?: boolean };
export type SkillRead = { found: FoundTech[]; errors: SkillError[]; folders: number };


export async function readSkills(repo: { owner: string; repo: string }): Promise<SkillRead> {
  const out: SkillRead = { found: [], errors: [], folders: 0 };
  let names: string[];
  try {
    const listing = await fetchText(`${repoApiUrl(repo)}/contents/${SKILLS_DIR}`, { headers: { Accept: "application/vnd.github+json" } });
    if (listing === null) return out; // 폴더가 없다 = 읽은 스킬이 없다(저장소가 안 열린 경우는 첫 읽기가 closedRepoErrors로 먼저 가르고 여기를 부르지 않는다)
    const parsed = skillFolderNames(listing);
    if (parsed === null) throw new CollectError("parse", `${SKILLS_DIR}: 폴더 목록의 모양이 달라 해석하지 못함`);
    names = parsed;
  } catch (e) {
    out.errors.push({ path: SKILLS_DIR, kind: errorKindOf(e), message: messageOf(e) });
    return out;
  }
  out.folders = names.length;
  // 한도 뒤의 스킬은 읽지 않았으니 이번에 못 읽은 스킬 줄만 수집 오류로(읽은 30개는 덮지 않게, 불변 2). 폴더가 아무리 많아도 오류는 하나·DB 갱신은 한 번
  if (names.length > MAX_SKILLS) out.errors.push({ path: SKILLS_DIR, kind: "parse", message: `스킬 폴더가 ${names.length}개라 앞의 ${MAX_SKILLS}개만 읽음`, onlyUnread: true });
  const reads = await Promise.all(names.slice(0, MAX_SKILLS).map(async (name) => {
    try {
      return { name, md: await fetchText(rawFileUrl(repo, `${SKILLS_DIR}/${name}/${SKILL_FILE}`)) };
    } catch (e) {
      return { name, failure: e };
    }
  }));
  for (const x of reads) {
    if ("failure" in x) out.errors.push({ path: `${SKILLS_DIR}/${x.name}`, kind: errorKindOf(x.failure), message: messageOf(x.failure) });
    else if (x.md !== null) out.found.push(skillFromFolder(x.name, repo)); // SKILL.md가 없는 폴더는 스킬이 아니다
  }
  return out;
}
