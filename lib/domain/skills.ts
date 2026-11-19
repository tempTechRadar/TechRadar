// 저장소의 스킬 폴더(.claude/skills/<이름>/) → 내 기술(SPEC-7.3, PRD-F6). 네트워크·DB를 모르는 순수 규칙. 주인: 김영식 A.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { FoundTech } from "./manifest.ts";
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

/**
 * 스킬 폴더 하나 → 내 기술. 늘 내 저장소의 것으로 두고 "출처 모름"을 켠다(다른 사람의 같은 이름 스킬과 묶이지 않게, SPEC-7.3).
 * SKILL.md 머리의 원본 주소(source 등)는 누구나 적을 수 있어 믿지 않는다: 믿으면 남의 공용 기술 줄에 끼어들어 "쓰고 있어요" 수를 부풀린다.
 * shortcut: 원본을 확인하지 않아 같은 스킬을 쓰는 프로젝트끼리도 묶이지 않는다. 원본 저장소에 그 폴더가 정말 있는지 확인하는 단계가 생기면 그때 묶는다.
 */
export function skillFromFolder(folder: string, mine: { owner: string; repo: string }): FoundTech {
  return { tech: skillKey(mine.owner, mine.repo, folder), name: folder, type: "skill", sourceFile: `${SKILLS_DIR}/${folder}`, unknownOrigin: true };
}
