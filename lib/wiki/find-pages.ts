// 위키 챗봇이 질문에 맞는 위키 쪽을 고른다(PRD-F31). 파일·DB·Claude를 모르는 순수 함수.
// v1은 낱말 맞추기로 시작한다(계획 P-26): 같은 질문에 같은 쪽이 나와야 정답표로 대조할 수 있다. 제목에 맞으면 본문보다 무겁게 센다.
export type WikiPage = { path: string; title: string; text: string };

const MAX_PAGES = 3;
const TITLE_WEIGHT = 3;
// 질문 끝에 붙는 조사·물음 끝말. 긴 것부터 뗀다(한 번만).
const ENDINGS = ["인가요", "나요", "까요", "에서", "으로", "에게", "부터", "까지", "은", "는", "이", "가", "을", "를", "도", "에", "의", "로", "와", "과", "요"];

const stripEnding = (word: string) => {
  const ending = ENDINGS.find((e) => word.length > e.length && word.endsWith(e));
  return ending ? word.slice(0, -ending.length) : word;
};

/** 질문을 찾을 낱말로 나눈다: 글자·숫자 덩어리, 끝말을 떼고, 한 글자는 버린다 */
export function questionWords(question: string): string[] {
  const words = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.map(stripEnding).filter((w) => w.length >= 2))];
}

/**
 * 쪽이 길면 질문 낱말이 든 줄(앞 한 줄·뒤 두 줄 포함: 충돌 요약 뒤의 "문서 A"·"문서 B" 줄까지)만 뽑는다. 첫 줄(제목)은 늘 넣고, 많이 맞은 줄부터 maxChars 안에서 고른 뒤
 * 원래 순서로 잇고 건너뛴 곳에 "…"를 둔다. 앞부분만 자르면 쪽 뒤쪽의 답("문서끼리 다른 곳" 등)이 빠진다(운영 11-19 정답표 Q5).
 */
export function excerptPage(text: string, words: string[], maxChars: number): string {
  if (text.length <= maxChars) return text;
  const lines = text.split("\n");
  const lower = lines.map((l) => l.toLowerCase());
  const score = (i: number) => words.reduce((s, w) => s + (lower[i].includes(w) ? 1 : 0), 0);
  const ranked = lines.map((_, i) => i).filter((i) => i > 0 && score(i) > 0).sort((a, b) => score(b) - score(a) || a - b);
  const keep = new Set<number>([0]);
  let used = lines[0].length + 1;
  for (const i of ranked) {
    for (const j of [i - 1, i, i + 1, i + 2]) {
      if (j < 1 || j >= lines.length || keep.has(j) || used + lines[j].length + 3 > maxChars) continue;
      keep.add(j);
      used += lines[j].length + 3;
    }
  }
  if (keep.size === 1) return text.slice(0, maxChars);
  const order = [...keep].sort((a, b) => a - b);
  return order.map((i, k) => (k > 0 && i !== order[k - 1] + 1 ? `…\n${lines[i]}` : lines[i])).join("\n").slice(0, maxChars);
}

/** 낱말이 제목·본문에 맞는지로 점수를 매겨 상위 3쪽. 하나도 안 맞으면 빈 목록 */
export function findWikiPages(question: string, pages: WikiPage[]): WikiPage[] {
  const words = questionWords(question);
  if (words.length === 0) return [];
  return pages
    .map((page) => {
      const title = page.title.toLowerCase();
      const text = page.text.toLowerCase();
      const score = words.reduce((sum, w) => sum + (title.includes(w) ? TITLE_WEIGHT : 0) + (text.includes(w) ? 1 : 0), 0);
      return { page, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path))
    .slice(0, MAX_PAGES)
    .map((s) => s.page);
}
