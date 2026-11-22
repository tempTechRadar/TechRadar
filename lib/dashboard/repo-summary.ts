// 프로젝트 관리 보드 W3 레포 카드(P-12i D1): 레포마다 AI 도구 구성(종류 · 출처 파일) · 등급 배터리 · 모델 종료 · 판단 대기. DB · 화면을 모르는 순수 함수.
// 숨긴 기술은 세지 않는다(repoCards와 같은 기준). 알림을 못 읽었으면(null) 판단 대기 · 모델 종료도 null(0으로 단정하지 않음, 불변 2).
import { isConcept, KIND_KO, MANUAL_KIND, type Grade } from "../map/build-map.ts";
import type { StatusProjectRow } from "./status-view.ts";

export type Battery = Record<Grade, number>;
export type RepoSummary = {
  battery: Battery; concepts: number;
  /** 종류별 수(많은 순), 출처 파일(이름순) */ tools: { label: string; n: number }[]; files: string[];
  pending: number | null; modelEol: number | null;
};
type AlertLike = { kind: string; status: string; projectId: string | null };

export function repoSummary(p: StatusProjectRow, alerts: AlertLike[] | null): RepoSummary {
  const techs = p.my_technologies.filter((t) => !t.hidden_at);
  const battery: Battery = { danger: 0, caution: 0, pass: 0, unknown: 0 };
  const kinds = new Map<string, number>();
  let concepts = 0;
  for (const t of techs) {
    if (isConcept(t.technologies?.tech_key, t.technologies?.type)) concepts++; // 작업 방식은 등급이 없어 배터리 밖
    else battery[t.grade]++;
    const type = t.technologies?.type, label = type ? KIND_KO[type] ?? type : MANUAL_KIND; // 지도 "종류"와 같은 말
    kinds.set(label, (kinds.get(label) ?? 0) + 1);
  }
  const mine = alerts?.filter((a) => a.projectId === p.id && a.status === "pending") ?? null;
  return {
    battery, concepts,
    tools: [...kinds].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    files: [...new Set(techs.flatMap((t) => (t.source_file ? [t.source_file] : [])))].sort(),
    pending: mine ? mine.length : null,
    modelEol: mine ? mine.filter((a) => a.kind === "model_eol").length : null,
  };
}
