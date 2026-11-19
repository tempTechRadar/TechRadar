// PRD-NF5 접근성 정적 점검(영역 C 화면 소스). JSX 글을 훑는 단순 규칙이라 화면을 띄우지 않는다.
// 잡는 것: 이름 없는 입력 칸, div·span 등에 onClick, alt 없는 img, 링크를 품고도 role=img인 SVG(안의 링크가 읽히지 않음), outline 없앰.
// shortcut: 정규식·괄호 세기 수준이다. 컴포넌트 너머(다른 파일에서 감싸는 label)는 보지 못하니, 이름은 칸과 같은 파일에서 붙인다.

/** `<tag`부터 같은 깊이의 `>`까지(중괄호·따옴표 안의 `>`, 화살표 함수의 `=>`는 건너뜀) */
function tagEnd(src: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  return src.length;
}

type Tag = { name: string; at: number; text: string };

function tags(src: string, names: string): Tag[] {
  const out: Tag[] = [];
  for (const m of src.matchAll(new RegExp(`<(${names})\\b`, "g"))) {
    const at = m.index ?? 0;
    out.push({ name: m[1], at, text: src.slice(at, tagEnd(src, at) + 1) });
  }
  return out;
}

const attr = (text: string, name: string) => text.match(new RegExp(`\\b${name}=(?:"([^"]*)"|\\{([^}]*)\\})`));
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

function insideLabel(src: string, at: number): boolean {
  const before = src.slice(0, at);
  return count(before, /<label\b/g) > count(before, /<\/label>/g);
}

/** 이름(접근 가능한 이름)이 없는 입력·고르기·글 칸 */
export function formControlProblems(src: string): string[] {
  const forIds = new Set([...src.matchAll(/htmlFor="([^"]+)"/g)].map((m) => m[1]));
  return tags(src, "input|select|textarea").flatMap((t) => {
    if (/\btype="hidden"/.test(t.text)) return [];
    if (/\baria-label(ledby)?=/.test(t.text)) return [];
    const id = attr(t.text, "id")?.[1];
    if (id && forIds.has(id)) return [];
    if (insideLabel(src, t.at)) return [];
    const name = attr(t.text, "name")?.[1] ?? id ?? "?";
    return [`이름 없는 ${t.name}(name=${name})`];
  });
}

/** 키보드로 못 누르는 클릭, alt 없는 이미지, 링크를 숨기는 SVG, 초점 테두리 없앰 */
export function interactiveProblems(src: string): string[] {
  const out: string[] = [];
  for (const t of tags(src, "div|span|li|g|rect|p|td|tr|section|text")) if (/\bonClick=/.test(t.text)) out.push(`${t.name}에 onClick`);
  for (const t of tags(src, "img")) if (!/\balt=/.test(t.text)) out.push("alt 없는 img");
  for (const t of tags(src, "svg")) {
    const close = src.indexOf("</svg>", t.at);
    const body = src.slice(t.at, close < 0 ? src.length : close);
    if (/\brole="img"/.test(t.text) && /<a\b/.test(body)) out.push("링크를 품은 SVG가 role=img(안의 링크가 읽히지 않음)");
  }
  // 지운 자리에 :focus-visible 모양을 함께 주면 괜찮다(흐름 그림의 상자 테두리)
  if (/outline\s*:\s*["']?(none|0)\b/.test(src) && !/:focus-visible/.test(src)) out.push("outline 없앰");
  return out;
}
