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

const META_ERROR_KO: Record<string, string> = { timeout: "시간 초과", network: "연결 실패", rate_limited: "요청 한도", http_status: "응답 오류", parse: "모양이 다름" };
const DAY_MS = 86_400_000;
const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" });
/** 레포 기본 정보 줄(D1' 칸): 설명 · 주 언어 · 마지막 푸시(상대 시간 + 날짜). 한 번도 못 읽었으면 "아직 읽지 않았어요",
 *  마지막 읽기가 실패했으면 그 사실(예전 값이 있으면 같이, 불변 2 · 4). 내 컴퓨터(로컬) 프로젝트는 null */
export function repoMetaLine(p: StatusProjectRow, now: Date): { info: string | null; error: string | null } | null {
  if (p.kind !== "repo") return null;
  const parts = [p.repo_description, p.repo_language ? `주 언어 ${p.repo_language}` : null];
  const pushed = p.repo_pushed_at ? Date.parse(p.repo_pushed_at) : Number.NaN;
  if (Number.isFinite(pushed)) {
    const d = Math.floor((now.getTime() - pushed) / DAY_MS);
    parts.push(`마지막 푸시 ${d <= 0 ? "오늘" : d < 31 ? `${d}일 전` : `${Math.floor(d / 30)}달 전`}(${date.format(new Date(pushed))})`);
  }
  const info = parts.filter(Boolean).join(" · ") || null;
  const error = p.repo_meta_error ? `레포 정보를 읽지 못했어요(${META_ERROR_KO[p.repo_meta_error] ?? p.repo_meta_error})${info ? ". 아래는 지난번 값이에요" : ""}` : null;
  return { info: info ?? (error ? null : p.repo_meta_at ? "설명 · 언어가 비어 있는 레포예요" : "레포 정보(설명 · 언어 · 마지막 푸시)를 아직 읽지 않았어요"), error };
}
