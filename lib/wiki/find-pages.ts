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
