// "시작하기" 체크리스트(11-21 사용자 결정, 요즘 웹앱 전형: 처음 할 일 3개). 지도가 이미 읽은 값으로만 정한다(새 조회 없음).
// 하나라도 못 읽었으면 null: "안 했음"으로 단정하지 않는다(불변 2). 다 했으면 null(체크리스트가 사라짐)
export type StartStep = { label: string; href: string; done: boolean };

export function startSteps(read: { projects: number; unseenCheck: boolean; judged: boolean } | null): StartStep[] | null {
  if (!read) return null;
  const steps = [
    { label: "프로젝트 등록하기", href: "/projects", done: read.projects > 0 },
    // 프로젝트가 있고 확인 안 한 첫 점검 띠가 없으면 끝(띠는 지도 위에 뜨고 "확인"으로 닫힘). 첫 읽기가 실패해 띠가 안 생겨도 막히지 않게
    { label: "첫 점검 결과 보기", href: "/projects", done: read.projects > 0 && !read.unseenCheck },
    { label: "판단 하나 남기기", href: "/alerts", done: read.judged }, // 알림 판단 또는 지도에서 관심 · 후보 · 보류
  ];
  return steps.every((s) => s.done) ? null : steps;
}
