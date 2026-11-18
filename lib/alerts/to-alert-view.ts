// 알림 한 건(DB 줄)을 화면에 그대로 찍을 값으로 바꾼다(IA-6·7, SPEC-5.1·5.2). DB·화면을 모르는 순수 함수.
import { buildAlertMessage } from "./build-alert-message.ts";
import type { AlertKind, AlertStatus } from "./filter-alerts.ts";

export type AlertRecord = {
  id: string;
  kind: AlertKind;
  status: AlertStatus;
  createdAt: string;
  projectName: string | null;
  sourceFile: string | null;
  change: {
    kind: string;
    techName: string;
    detectedAt: string | null;
    prevValue: unknown;
    currValue: unknown;
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
};

type Evidence = { id?: string; severity?: string; url?: string };
type Value = { grade?: string; reason?: string; fixed_version?: string | null; evidence?: Evidence[] };

const GRADE_LABEL: Record<string, string> = { danger: "위험", caution: "주의", pass: "통과", unknown: "찾지 못함" };

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
  const base = {
    id: record.id,
    kindLabel: kind.label,
    kindTone: kind.tone,
    ...(record.status === "done" ? { statusLabel: "완료", statusTone: "success" as const } : { statusLabel: "판단 대기", statusTone: "warning" as const }),
    createdAt: record.createdAt,
    createdAtLabel: listTime.format(new Date(record.createdAt)),
    subtitle: subtitleOf(record),
  };
  // 보안 경고만 문구를 만든다. 적용 기회·모델 종료의 상세는 P-14에서 채운다.
  if (record.kind !== "security") return { ...base, title: `[${kind.label}] ${change.techName}`, lines: [] };
  const curr = asValue(change.currValue);
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
  return { ...base, title: message.title, lines: message.lines };
}

function subtitleOf(record: AlertRecord): string {
  const where = record.projectName ? `내 프로젝트: ${record.projectName}` : "프로젝트 밖(내 컴퓨터)";
  return record.change.kind === "first_seen_danger" ? `첫 점검 · ${where}` : where;
}
