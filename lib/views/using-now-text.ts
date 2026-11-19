// "쓰고 있어요" 문구(PRD-F34, 불변 2). DB·화면을 모르는 순수 함수.
// 못 읽었을 때(null)는 "없다"가 아니라 "못 불러왔다"로 보여 "아무도 안 쓴다"로 오해하지 않게 한다. 보이는 것은 공개한 사람의 별명과 수뿐이다.
export type UsingNowView = { count: number; nicknames: string[] };

export function usingNowText(view: UsingNowView | null): string {
  if (view === null) return "쓰고 있어요를 불러오지 못했어요(쓰는 사람이 없다는 뜻이 아니에요)";
  if (view.count === 0) return "아직 쓴다고 공개한 사람이 없어요";
  const rest = view.count - view.nicknames.length;
  return `${view.count}명이 쓰고 있어요: ${view.nicknames.join(", ")}${rest > 0 ? ` 외 ${rest}명` : ""}`;
}
