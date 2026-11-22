// 블루프린트 내보내기(design.md 14절 ⑤): 프롬프트 · CLAUDE.md 글 · 다듬기용 메타프롬프트. 글만 만든다(설치 · 저장소 변경 · AI 호출 없음).
import type { Board } from "./board.ts";

export type ExportKind = "prompt" | "md" | "meta";
const techs = (t: { name: string }[]) => t.map((x) => x.name).join(", ");
/** 단계 메모(P-12h-2 T2): 번호 줄 아래 "   메모: …"(같은 순서에 여럿이면 단계 이름을 붙임). 줄바꿈은 한 줄로 */
const notes = (col: Board[number]) => col.filter((s) => s.note).map((s) => `\n   메모${col.length > 1 ? `(${s.name})` : ""}: ${oneLine(s.note!)}`).join("");
const steps = (b: Board) =>
  b.map((col, i) => `${i + 1}. ${col.map((s) => `${s.name}${s.techs.length ? `(${techs(s.techs)})` : ""}`).join(" + ")}${col.length > 1 ? " — 동시에 진행" : ""}${notes(col)}`).join("\n");
/** 표 칸 · 태그 속성 안에서 형식이 깨지지 않게 */
const oneLine = (s: string) => s.replace(/\r?\n/g, " ");
const cell = (s: string) => oneLine(s.replace(/\|/g, "/"));
const attr = (s: string) => s.replace(/["<>]/g, "");

const META_RULES = [
  "너는 개발 작업 계획을 다듬는 도우미야. 아래 청사진을 검토해서 같은 형식으로 고쳐 줘.",
  "- 빠진 단계가 있으면 넣고, 필요 없는 단계는 빼 줘.",
  "- 순서와 동시에 할 단계(같은 번호)가 맞는지 봐 줘.",
  "- 단계마다 끝났다고 볼 기준을 한 줄 붙여 줘.",
  "- 각 도구가 그 단계에 맞는지, 더 나은 도구가 있으면 이유와 함께 알려 줘.",
  "- 바꾼 곳마다 이유를 한 줄로 적어 줘.",
].join("\n");

export function exportText(kind: ExportKind, name: string, b: Board): string {
  if (kind === "md") {
    const rows = b.flatMap((col, i) => col.map((s) => `| ${i + 1} | ${cell(s.name)} | ${cell(techs(s.techs)) || "-"} | ${s.note ? `메모: ${cell(s.note)}` : "-"} |`));
    return `## 작업 단계와 쓸 도구\n\n| 순서 | 단계 | 쓸 도구 | 메모 |\n|---|---|---|---|\n${rows.join("\n")}\n\n같은 순서 번호의 단계는 동시에 진행한다.\n`;
  }
  if (kind === "meta") return `${META_RULES}\n\n<청사진 이름="${attr(name)}">\n${steps(b)}\n</청사진>\n`;
  return `아래 청사진대로 작업해 줘. 같은 번호의 단계는 동시에 진행해도 돼. 단계마다 괄호 안의 도구를 먼저 써 줘.\n\n${steps(b)}\n`;
}
