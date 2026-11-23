// 블루프린트 내보내기(design.md 14절 ⑤): 프롬프트 · CLAUDE.md 글 · 다듬기용 메타프롬프트. 글만 만든다(설치 · 저장소 변경 · AI 호출 없음).
import type { Board } from "./board.ts";
import type { Graph, TechLink } from "./graph.ts";

/** mermaid = README 등에 붙이는 흐름도(P-12h-2 T4, 선 그대로라 graph로 만든다) */
export type ExportKind = "prompt" | "md" | "meta" | "mermaid";
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

/** 기술 관계선(P-12j H2) → "기술 → 기술" 글. 사용자가 그은 표시라 "사용자 표시 관계"로만 부른다(호환 · 검증 아님, 데이터 정직성 규칙 1). 이름을 못 찾는 끝은 뺀다 */
function namedLinks(g: Graph): (TechLink & { text: string })[] {
  const name = new Map<string, string>(g.stages.flatMap((s) => s.techs.map((t) => [`${t.id}@${s.id}`, t.name])));
  return (g.links ?? []).flatMap((l) => { const a = name.get(l.from), b = name.get(l.to); return a && b ? [{ ...l, text: `${oneLine(a)} → ${oneLine(b)}` }] : []; });
}
export const linkLines = (g: Graph): string[] => namedLinks(g).map((l) => l.text);
const RELATION = "사용자 표시 관계";
/** 프롬프트 · 다듬기 끝에 붙는 관계 줄(없으면 빈 글) */
const relationTail = (rel: string[]) => (rel.length ? `\n${rel.map((r) => `${RELATION}: ${r}`).join("\n")}\n` : "");

/** rel = linkLines(graph). 프롬프트 · CLAUDE.md에 "사용자 표시 관계: A → B" 줄로 붙는다. sec = sectionLines(graph)(P-12o): 단계 앞에 섹션 머리를 한 번 */
export function exportText(kind: ExportKind, name: string, b: Board, rel: string[] = [], sec: string[] = []): string {
  const head = sec.length ? `${sec.join("\n")}\n\n` : "";
  if (kind === "md") {
    const rows = b.flatMap((col, i) => col.map((s) => `| ${i + 1} | ${cell(s.name)} | ${cell(techs(s.techs)) || "-"} | ${s.note ? `메모: ${cell(s.note)}` : "-"} |`));
    const relMd = rel.length ? `\n${rel.map((r) => `- ${RELATION}: ${r}`).join("\n")}\n` : "";
    return `## 작업 단계와 쓸 도구\n\n${sec.map((x) => `- ${x}`).join("\n")}${sec.length ? "\n\n" : ""}| 순서 | 단계 | 쓸 도구 | 메모 |\n|---|---|---|---|\n${rows.join("\n")}\n\n같은 순서 번호의 단계는 동시에 진행한다.\n${relMd}`;
  }
  if (kind === "meta") return `${META_RULES}\n\n<청사진 이름="${attr(name)}">\n${head}${steps(b)}\n${relationTail(rel)}</청사진>\n`;
  return `아래 청사진대로 작업해 줘. 같은 번호의 단계는 동시에 진행해도 돼. 단계마다 괄호 안의 도구를 먼저 써 줘.\n\n${head}${steps(b)}\n${relationTail(rel)}`;
}

/** Mermaid 글 안에서 형식이 깨지지 않게(따옴표 · 꺾쇠는 Mermaid 엔티티로, 줄바꿈은 한 칸) */
const mm = (s: string) => oneLine(s).replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;");
/** flowchart LR: 단계마다 n1["이름<br/>기술"], 선마다 n1 --> n2, 기술 관계선은 그 기술이 든 단계끼리 점선 n1 -.->|"사용자 표시 관계: A → B"| n2. 단계 메모는 넣지 않는다(README에 개인 글이 새지 않게). id는 차례 번호(단계 id의 - 가 화살표와 헷갈리지 않게) */
export function exportMermaid(g: Graph): string {
  const at = new Map(g.stages.map((s, i) => [s.id, `n${i + 1}`]));
  const nodes = g.stages.map((s) => `  ${at.get(s.id)}["${mm(s.name)}${s.techs.length ? `<br/>${mm(techs(s.techs))}` : ""}"]`);
  const edges = g.edges.flatMap((e) => (at.has(e.from) && at.has(e.to) ? [`  ${at.get(e.from)} --> ${at.get(e.to)}`] : []));
  const stageOf = (end: string) => at.get(end.slice(end.lastIndexOf("@") + 1));
  const links = namedLinks(g).map((l) => `  ${stageOf(l.from)} -.->|"${mm(`${RELATION}: ${l.text}`)}"| ${stageOf(l.to)}`);
  return `${["flowchart LR", ...nodes, ...edges, ...links].join("\n")}\n`;
}
