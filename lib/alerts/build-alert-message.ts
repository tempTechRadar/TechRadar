// 알림 문구를 SPEC-5.1·5.2 형식으로 만든다. DB·화면을 모르는 순수 함수.
// 대응안 초안·비슷한 지난 판단 줄은 값이 생기는 P-13·P-15에서 붙인다.

export type AlertMessageInput = {
  kind: "grade_to_danger" | "first_seen_danger";
  techName: string;
  prevGrade: string | null;
  causeText: string | null;
  source: string | null;
  detectedAt: string | null;
  easyReason: string | null;
  projectName: string | null;
  sourceFile: string | null;
  fixedVersion: string | null;
};

export type AlertMessage = { title: string; lines: string[] };

const koreanTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const NOT_FOUND = "찾지 못함";

function orNotFound(value: string | null): string {
  return value ? value : NOT_FOUND;
}

function formatKoreanTime(iso: string | null): string {
  if (!iso) return NOT_FOUND;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? NOT_FOUND : koreanTime.format(date);
}

export function buildAlertMessage(input: AlertMessageInput): AlertMessage {
  return input.kind === "first_seen_danger" ? buildFirstCheck(input) : buildSecurityWarning(input);
}

function buildFirstCheck(input: AlertMessageInput): AlertMessage {
  return {
    title: `[첫 점검] ${input.techName}은 지금 위험이에요`,
    lines: [
      `이유: ${orNotFound(input.easyReason)} (${orNotFound(input.source)})`,
      `고친 버전: ${input.fixedVersion ? input.fixedVersion : "아직 없음"}`,
    ],
  };
}

function buildSecurityWarning(input: AlertMessageInput): AlertMessage {
  const when = formatKoreanTime(input.detectedAt);
  return {
    title: `[보안 경고] ${input.techName} — ${orNotFound(input.prevGrade)} → 위험`,
    lines: [
      `무엇이 바뀌었나: ${orNotFound(input.causeText)} (${orNotFound(input.source)}, ${when})`,
      `쉬운 이유: ${orNotFound(input.easyReason)}`,
      `내 프로젝트: ${orNotFound(input.projectName)} · ${orNotFound(input.sourceFile)}`,
    ],
  };
}
