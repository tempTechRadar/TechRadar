// 주간 다운로드 읽기(P-9, SPEC-8): 기술 키 → 패키지, 응답 읽기, 바뀐 정도 글. 순수 함수만(바깥 호출은 lib/server).
// 응답 모양이 다르면 0이 아니라 null: 못 읽은 것을 "다운로드 0"으로 단정하지 않는다(불변 2).
export type Ecosystem = "npm" | "pypi";
export type PackageRef = { ecosystem: Ecosystem; name: string };

// 주소 경로에 그대로 쓰이므로 첫 글자와 쓸 수 있는 글자를 좁게 잡는다(`..`·`?`·`#`·공백이 들어오지 못함).
const NPM_NAME = /^(?:@[a-z0-9][\w.~-]*\/)?[a-z0-9][\w.~-]*$/i;
const PYPI_NAME = /^[a-z0-9](?:[\w.-]*[a-z0-9])?$/i;

/** `npm:`·`pypi:` 기술 키만 패키지로 읽는다. 다른 종류(mcp·github·skill…)와 주소에 쓸 수 없는 이름은 null. pypi 이름은 PEP 503 모양으로 맞춘다. */
export function packageOf(techKey: string): PackageRef | null {
  const m = /^(npm|pypi):(.+)$/.exec(techKey);
  if (!m) return null;
  const [, ecosystem, name] = m;
  if (ecosystem === "npm") return NPM_NAME.test(name) ? { ecosystem, name } : null;
  return PYPI_NAME.test(name) ? { ecosystem: "pypi", name: name.toLowerCase().replace(/[-_.]+/g, "-") } : null;
}

// @scope/name은 @와 /를 살려 둔다(npm 다운로드 API가 그렇게 받는다). 나머지는 조각마다 인코딩한다.
const npmPath = (name: string) =>
  name
    .split("/")
    .map((part, i) => (i === 0 && part.startsWith("@") ? `@${encodeURIComponent(part.slice(1))}` : encodeURIComponent(part)))
    .join("/");

// `.`·`..` 조각은 인코딩해도 그대로라 주소가 같은 호스트의 다른 경로로 접힌다. packageOf를 거치지 않은 값도 막는다.
const hasDotSegment = (name: string) => name.split("/").some((part) => part === "." || part === "..");

/** 사람이 보는 패키지 소개 페이지(비교표 "사용량"의 출처). npm·pypi 키만, 아니면 null: 다운로드 수가 없는 종류에 출처를 지어내지 않는다. */
export function packagePageUrl(techKey: string): string | null {
  const ref = packageOf(techKey);
  if (!ref) return null;
  return ref.ecosystem === "npm" ? `https://www.npmjs.com/package/${npmPath(ref.name)}` : `https://pypi.org/project/${encodeURIComponent(ref.name)}/`;
}

export function downloadsUrl({ ecosystem, name }: PackageRef): string {
  if (hasDotSegment(name)) throw new RangeError(`주소에 쓸 수 없는 이름: ${name}`);
  if (ecosystem === "pypi") return `https://pypistats.org/api/packages/${encodeURIComponent(name)}/recent`;
  return `https://api.npmjs.org/downloads/point/last-week/${npmPath(name)}`;
}

const asRecord = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const asCount = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** npm: `{"downloads": 숫자, …}`. 오류 본문(`{"error": …}`)이나 다른 모양은 null. */
export function readNpmWeekly(text: string): number | null {
  return asCount(asRecord(parseJson(text))?.downloads);
}

/** pypistats: `{"data": {"last_week": 숫자, …}, …}`. */
export function readPypiWeekly(text: string): number | null {
  return asCount(asRecord(asRecord(parseJson(text))?.data)?.last_week);
}

const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** 수집 자료의 "바뀐 정도"(erd observations.change_size). 이전 값이 없으면 처음 읽음, 0이거나 비율이 0.0%로 나오면 값으로. */
export function describeChange(prev: number | null, curr: number): string {
  if (prev === null) return `처음 읽음: 주간 ${withCommas(curr)}회`;
  if (prev === 0) return `주간 0 → ${withCommas(curr)}회`;
  const pct = Math.round(((curr - prev) / prev) * 1000) / 10;
  if (pct === 0) return `주간 ${withCommas(prev)} → ${withCommas(curr)}회`; // 값은 달라졌는데 "0%"로 쓰면 안 바뀐 것처럼 읽힌다
  return `주간 다운로드 ${pct > 0 ? "+" : ""}${pct}%`;
}
