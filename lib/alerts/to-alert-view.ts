// 알림 한 건(DB 줄)을 화면에 그대로 찍을 값으로 바꾼다(IA-6·7, SPEC-5.1·5.2). DB·화면을 모르는 순수 함수.
import { buildAlertMessage } from "./build-alert-message.ts";
import type { ComparisonRow } from "./build-comparison.ts";
import type { AlertKind, AlertStatus } from "./filter-alerts.ts";

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
  statusTone: "warning" | "success";
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

const listTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

const asValue = (raw: unknown): Value => (raw && typeof raw === "object" ? (raw as Value) : {});

const KIND_LABEL: Record<AlertKind, { label: string; tone: "danger" | "neutral" }> = {
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
    ...(record.status === "done" ? { statusLabel: "완료", statusTone: "success" as const } : { statusLabel: "판단 대기", statusTone: "warning" as const }),
    createdAt: record.createdAt,
    createdAtLabel: listTime.format(new Date(record.createdAt)),
    subtitle: subtitleOf(record),
    judgmentLine: judgmentLineOf(record.judgment),
    judgedAtLabel: record.judgment ? listTime.format(new Date(record.judgment.judgedAt)) : null,
    canCandidate: record.kind !== "security" || Boolean(curr.fixed_version),
    draftCard: draftCardOf(record),
  };
  if (record.kind === "opportunity" && record.comparison) return opportunityView(base, record.comparison);
  // 모델 종료의 상세는 3순위. 비교표를 모르는 적용 기회도 이름만 보인다.
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
    title: `[적용 기회] 같은 역할의 새 기술 ${newTechName} (내 기술: ${myTechName})`,
    lines: [],
    reasonLine: `내 기술(${myTechName})과 같은 역할로 확정됐어요. 확정한 날: ${day}.`,
    comparison: {
      headers: { mine: `내 기술 ${myTechName}`, theirs: `새 기술 ${newTechName}` },
      rows: rows.map((row) => ({ item: row.item, mine: cellOf(row.mine), theirs: cellOf(row.theirs) })),
    },
  };
}

function subtitleOf(record: AlertRecord): string {
  const where = record.projectName ? `내 프로젝트: ${record.projectName}` : "프로젝트 밖(내 컴퓨터)";
  const withKind = record.change.kind === "first_seen_danger" ? `첫 점검 · ${where}` : where;
  return record.judgment ? `${withKind} · 판단: ${DECISION_LABEL[record.judgment.decision]}` : withKind;
}

const DECISION_LABEL = { candidate: "적용 후보", hold: "보류" };

function judgmentLineOf(judgment: AlertRecord["judgment"]): string | null {
  if (!judgment) return null;
  if (judgment.decision === "hold") return `보류 · 이유: ${judgment.reason ?? NOT_FOUND}`;
  return judgment.fixedVersion ? `적용 후보 · 고친 버전 ${judgment.fixedVersion}` : "적용 후보";
}
