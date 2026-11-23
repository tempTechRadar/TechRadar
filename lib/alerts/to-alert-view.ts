// 알림 한 건(DB 줄)을 화면에 그대로 찍을 값으로 바꾼다(IA-6·7, SPEC-5.1·5.2). DB·화면을 모르는 순수 함수.
import { buildAlertMessage } from "./build-alert-message.ts";
import type { ComparisonRow } from "./build-comparison.ts";
import type { AlertKind, AlertStatus } from "./filter-alerts.ts";
import { EARLIEST_ONLY, PROVIDER_KO, type Provider } from "../domain/model-eol.ts";
import { KIND_KO } from "../map/build-map.ts";

/** 적용 기회 알림을 만들 때 저장해 둔 비교표(alerts.comparison). 만든 때의 값이다 */
export type AlertComparison = { myTechName: string; newTechName: string; confirmedAt: string | null; rows: ComparisonRow[] };

export type AlertRecord = {
  id: string;
  kind: AlertKind;
  status: AlertStatus;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
  sourceFile: string | null;
  judgment: { decision: "candidate" | "hold"; reason: string | null; fixedVersion: string | null; judgedAt: string } | null;
  /** 적용 기회 알림의 비교표. 없거나 모양이 맞지 않으면 null */
  comparison: AlertComparison | null;
  /** 이 알림이 가리키는 내 기술 줄(상세 링크). 읽지 않았으면 없음 */
  myTechnologyId?: string | null;
  /** 변경의 기술: 지도에서 보기 · 행 태그(하는 일 갈래 · 종류) */
  tech?: { id: string; type: string | null; field: string | null } | null;
  change: {
    kind: string;
    techName: string;
    detectedAt: string | null;
    prevValue: unknown;
    currValue: unknown;
    /** 변경마다 1번 만든 대응안 초안(Claude). 아직 없거나 만들지 못했으면 null */
    draft: { text: string; sources: string[] } | null;
  };
};

export type AlertView = {
  id: string;
  kindLabel: string;
  kindTone: "danger" | "neutral";
  statusLabel: string;
  /** 판단 대기 = 얼음 파랑, 완료 = 중립 회색(P-12n 공통 색 뜻: 초록은 "통과"에만, 노랑은 "주의"에만) */
  statusTone: "pending" | "done";
  createdAt: string;
  createdAtLabel: string;
  title: string;
  subtitle: string;
  lines: string[];
  /** 판단을 마친 알림의 "내 판단" 한 줄. 아직이면 null */
  judgmentLine: string | null;
  judgedAtLabel: string | null;
  /** 보안 경고인데 고친 버전이 아직 없으면 false: 적용 후보로 저장할 수 없다(ADR 0012) */
  canCandidate: boolean;
  /** 적용 기회 상세의 "나오게 된 이유" 한 줄. 다른 알림이거나 비교표를 모르면 null */
  reasonLine: string | null;
  comparison: ComparisonView | null;
  /** 행 태그: 하는 일 갈래 · 종류(design.md 19절). 모르면 빈 목록 */
  tags: string[];
  /** 판단 단추 글자(19절): 보안 경고는 "고친 버전 X로 올리기", 적용 기회는 "써 볼 후보로" */
  candidateLabel: string;
  /** 보안 경고 상세의 "대응안 초안" 카드. 보안 경고가 아니면 null, 초안이 없으면 "만들지 못함" 상태 */
  draftCard: { state: "ready"; text: string; sources: string[] } | { state: "missing" } | null;
};

/** 출처는 http(s) 주소만 링크로 쓴다(그 밖의 글·javascript: 같은 주소는 글자로만) */
export type CellView = { value: string; source: string | null; sourceIsLink: boolean };
export type ComparisonView = { headers: { mine: string; theirs: string }; rows: { item: string; mine: CellView; theirs: CellView }[] };

type BaseView = Omit<AlertView, "title" | "lines" | "reasonLine" | "comparison">;

type Evidence = { id?: string; severity?: string; url?: string };
type Value = { grade?: string; reason?: string; fixed_version?: string | null; evidence?: Evidence[] };

const NOT_FOUND = "찾지 못함";
export const GRADE_LABEL: Record<string, string> = { danger: "위험", caution: "주의", pass: "통과", unknown: "찾지 못함" };

export const listTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

const asValue = (raw: unknown): Value => (raw && typeof raw === "object" ? (raw as Value) : {});

export const KIND_LABEL: Record<AlertKind, { label: string; tone: "danger" | "neutral" }> = {
  security: { label: "보안 경고", tone: "danger" },
  opportunity: { label: "적용 기회", tone: "neutral" },
  model_eol: { label: "모델 종료", tone: "neutral" },
};

export function toAlertView(record: AlertRecord): AlertView {
  const { change } = record;
  const kind = KIND_LABEL[record.kind];
  const curr = asValue(change.currValue);
  const base = {
    id: record.id,
    kindLabel: kind.label,
    kindTone: kind.tone,
    ...(record.status === "done" ? { statusLabel: "완료", statusTone: "done" as const } : { statusLabel: "판단 대기", statusTone: "pending" as const }),
    createdAt: record.createdAt,
    createdAtLabel: listTime.format(new Date(record.createdAt)),
    subtitle: subtitleOf(record),
    judgmentLine: judgmentLineOf(record.judgment),
    judgedAtLabel: record.judgment ? listTime.format(new Date(record.judgment.judgedAt)) : null,
    canCandidate: record.kind !== "security" || Boolean(curr.fixed_version),
    tags: [record.tech?.field, record.tech?.type ? KIND_KO[record.tech.type] ?? null : null].filter((t): t is string => Boolean(t)),
    candidateLabel: candidateLabelOf(record.kind, curr.fixed_version ?? null),
    draftCard: draftCardOf(record),
  };
  if (record.kind === "opportunity" && record.comparison) return opportunityView(base, record.comparison);
  if (record.kind === "model_eol") return modelEolView(base, record);
  // 비교표를 모르는 적용 기회는 이름만 보인다.
  if (record.kind !== "security") return { ...base, title: `[${kind.label}] ${change.techName}`, lines: [], reasonLine: null, comparison: null };
  const cause = curr.evidence?.[0];
  const prevGrade = asValue(change.prevValue).grade;
  const message = buildAlertMessage({
    kind: change.kind as "grade_to_danger" | "first_seen_danger",
    techName: change.techName,
    prevGrade: prevGrade ? GRADE_LABEL[prevGrade] ?? null : null,
    causeText: cause?.id ? `${cause.id} (심각도 ${cause.severity})` : null,
    source: cause?.url ?? null,
    detectedAt: change.detectedAt,
    easyReason: curr.reason ?? null,
    projectName: record.projectName,
    sourceFile: record.sourceFile,
    fixedVersion: curr.fixed_version ?? null,
  });
  return { ...base, title: message.title, lines: message.lines, reasonLine: null, comparison: null };
}

type EolValue = { model?: string; provider?: Provider; retire_on?: string; replacement?: string; source?: string };

/** 모델 지원 종료(SPEC-3.3): 만들 때 저장한 공식 공지 값(changes.curr_value)으로 그린다. 줄은 "항목: 값" */
function modelEolView(base: BaseView, record: AlertRecord): AlertView {
  const v = (record.change.currValue ?? {}) as EolValue;
  const model = v.model ?? record.change.techName;
  const provider = v.provider && PROVIDER_KO[v.provider] ? v.provider : null;
  const day = v.retire_on || NOT_FOUND;
  return {
    ...base,
    title: `[모델 종료] ${model} 지원 종료일 ${day}`,
    lines: [
      `모델: ${model}`,
      `지원 종료일: ${day}${provider && EARLIEST_ONLY.has(provider) ? " (공지에 '가장 이르면 이날'로 적혀 있어요)" : ""}`,
      `공식 추천 대체: ${v.replacement || NOT_FOUND}`,
      `내 코드: ${[record.projectName, record.sourceFile].filter(Boolean).join(" · ") || NOT_FOUND}`,
      `출처: ${provider ? `${PROVIDER_KO[provider]} 지원 종료 공지` : NOT_FOUND}`,
      `공지 주소: ${v.source || NOT_FOUND}`,
    ],
    reasonLine: null,
    comparison: null,
  };
}

// 초안은 보안 경고에만 있다. 출처는 http(s) 주소만 남긴다(링크로 쓰므로).
function draftCardOf(record: AlertRecord): AlertView["draftCard"] {
  if (record.kind !== "security") return null;
  const { draft } = record.change;
  if (!draft) return { state: "missing" };
  return { state: "ready", text: draft.text, sources: draft.sources.filter((source) => /^https?:\/\//i.test(source)) };
}

const confirmedDay = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

export const cellOf = ({ value, source }: { value: string; source: string | null }): CellView => ({
  value,
  source,
  sourceIsLink: source !== null && /^https?:\/\//i.test(source),
});

// 제목은 조사를 붙이지 않는다: 영어 이름 뒤의 과/와·이/가를 정할 수 없어서(SPEC-5.3 문구를 조사 없이 바꿈)
function opportunityView(base: BaseView, comparison: NonNullable<AlertRecord["comparison"]>): AlertView {
  const { myTechName, newTechName, confirmedAt, rows } = comparison;
  const day = confirmedAt ? confirmedDay.format(new Date(confirmedAt)) : NOT_FOUND;
  return {
    ...base,
    title: `[적용 기회] 같은 역할의 새 기술 ${newTechName} (사용 중인 항목: ${myTechName})`,
    lines: [],
    reasonLine: `사용 중인 항목(${myTechName})과 같은 역할로 확정됐어요. 확정한 날: ${day}.`,
    comparison: {
      headers: { mine: `사용 중인 항목 ${myTechName}`, theirs: `새 기술 ${newTechName}` },
      rows: rows.map((row) => ({ item: row.item, mine: cellOf(row.mine), theirs: cellOf(row.theirs) })),
    },
  };
}

function subtitleOf(record: AlertRecord): string {
  const where = record.projectName ? `프로젝트: ${record.projectName}` : "프로젝트 밖(내 컴퓨터)";
  const withKind = record.change.kind === "first_seen_danger" ? `첫 점검 · ${where}` : where;
  return record.judgment ? `${withKind} · 판단: ${DECISION_LABEL[record.judgment.decision]}` : withKind;
}

const DECISION_LABEL = { candidate: "적용 후보", hold: "보류" };

function candidateLabelOf(kind: AlertKind, fixedVersion: string | null): string {
  // 판단만 남기는 단추라 "올리기"처럼 실행하는 말은 쓰지 않는다(불변 1). 버전 뒤 조사는 읽는 법에 따라 달라 붙이지 않는다
  if (kind === "security") return fixedVersion ? `적용 후보로 · 고친 버전 ${fixedVersion}` : "적용 후보";
  return kind === "opportunity" ? "써 볼 후보로" : "바꿀 후보로";
}

function judgmentLineOf(judgment: AlertRecord["judgment"]): string | null {
  if (!judgment) return null;
  if (judgment.decision === "hold") return `보류 · 이유: ${judgment.reason ?? NOT_FOUND}`;
  return judgment.fixedVersion ? `적용 후보 · 고친 버전 ${judgment.fixedVersion}` : "적용 후보";
}
