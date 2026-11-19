// 위키 쪽 읽기(P-26). 저장소의 wiki/ 아래 .md를 서버가 읽는다(배포 묶음에는 next.config의 outputFileTracingIncludes로 넣음).
// 폴더가 없으면 빈 목록: 챗봇은 "위키에 없습니다"로 답한다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { WikiPage } from "../wiki/find-pages.ts";

const titleOf = (text: string, file: string) => text.match(/^#\s+(.+)$/m)?.[1].trim() ?? basename(file, ".md");

export function readWikiPages(root: string): WikiPage[] {
  const dir = join(root, "wiki");
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true, encoding: "utf8" }) as string[])
    .map((rel) => rel.replaceAll("\\", "/"))
    .filter((rel) => rel.endsWith(".md") && statSync(join(dir, rel)).isFile())
    .sort()
    .map((rel) => {
      const text = readFileSync(join(dir, rel), "utf8");
      return { path: `wiki/${rel}`, title: titleOf(text, rel), text };
    });
}
