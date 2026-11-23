// 청사진 변경 이력 표(P-12v 사용자: 줄글 말고 칸마다 정리). 판을 바꾼 알림 글 + 시각 → 종류 · 내용. 순수 함수.
// 종류는 알림 글의 낱말로 고른다(글은 panel-view.ts · studio.tsx가 만든다). 맞는 것이 없으면 "바꿈".
export type LogEntry = { text: string; at: number };

const KINDS: [string, RegExp][] = [
  ["섹션", /섹션/], ["관계", /관계/], ["연결", /연결/], ["이름", /이름을/], ["옮김", /옮겼|순서를 바꿨/],
  ["빼기", /지웠|뺐/], ["더하기", /넣었|더했/], ["판", /불러|템플릿|가져|정렬/],
];
export const logKind = (text: string): string => KINDS.find(([, re]) => re.test(text))?.[0] ?? "바꿈";
/** 표 내용: 되돌리기 안내 문장은 뺀다(되돌리기는 위 막대에 늘 있음) */
export const logText = (text: string): string => text.replace(/\s*[^.]*되돌리기로[^.]*\.\s*/g, " ").trim();
/** 시각 HH:MM:SS(이 브라우저 시간) */
export const logTime = (at: number): string => { const d = new Date(at), p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
