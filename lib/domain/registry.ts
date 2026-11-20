// 공식 MCP 레지스트리 읽기의 순수 규칙(P-9c, SPEC-8, ADR 0019): 응답 읽기, 기술 키, 상태, 공식 조직. 바깥 호출·DB는 lib/server.
// 응답 모양이 다르면 0건이 아니라 null: 못 읽은 것을 "서버 없음"으로 단정하지 않는다(불변 2).
import { npmKey, pypiKey } from "./tech-key.ts";

export type RegistryStatus = "active" | "deprecated" | "deleted";
export type RegistryPackage = { registryType: string; identifier: string };
export type RegistryEntry = {
  name: string; title: string | null; description: string | null; packages: RegistryPackage[]; repoUrl: string | null; status: RegistryStatus; isLatest: boolean;
  /** 레지스트리에 이 버전이 올라간 시각(없거나 날짜가 아니면 null). onlyLatest 뒤에는 쪽 안에서 본 가장 이른 버전의 시각 */
  publishedAt: string | null;
};
/** invalid: 모양이 이상해 읽지 못한 항목 수. nextCursor: 다음 쪽(마지막 쪽이면 null) */
export type RegistryPage = { entries: RegistryEntry[]; invalid: number; nextCursor: string | null };
export type TechDraft = { techKey: string; displayName: string; oneLiner: string | null; repoUrl: string | null; status: "active" | "deprecated" | "gone" };

const META_KEY = "io.modelcontextprotocol.registry/official"; // 레지스트리 자신의 메타 이름: 모든 항목에 있어서 "공식 조직"의 뜻이 아니다(ADR 0019)
const STATUSES = new Set<string>(["active", "deprecated", "deleted"]);
const MAX_ONE_LINER = 200;
const MAX_DISPLAY_NAME = 100; // 게시자가 적는 글이 화면과 AI 입력에 길게 들어가지 않게

const asRecord = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

function readPackages(v: unknown): RegistryPackage[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((p) => {
    const rec = asRecord(p);
    const registryType = str(rec?.registryType);
    const identifier = str(rec?.identifier);
    return registryType && identifier ? [{ registryType, identifier }] : [];
  });
}

function readEntry(raw: unknown): RegistryEntry | null {
  const rec = asRecord(raw);
  const server = asRecord(rec?.server);
  const meta = asRecord(asRecord(rec?._meta)?.[META_KEY]);
  const name = str(server?.name);
  const status = str(meta?.status);
  // isLatest가 없거나 참·거짓이 아니면 "최신 아님"이 아니라 못 읽은 항목: 모양이 바뀌었을 때 서버가 조용히 0개가 되지 않게(불변 2)
  if (!server || !meta || !name || !status || !STATUSES.has(status) || typeof meta.isLatest !== "boolean") return null;
  return {
    name, title: str(server.title), description: str(server.description), packages: readPackages(server.packages),
    repoUrl: str(asRecord(server.repository)?.url), status: status as RegistryStatus, isLatest: meta.isLatest,
    publishedAt: typeof meta.publishedAt === "string" && !Number.isNaN(Date.parse(meta.publishedAt)) ? meta.publishedAt : null,
  };
}

/** 목록 한 쪽을 읽는다. 쪽 전체의 모양이 다르면 null, 이상한 항목은 건너뛰고 invalid로 센다. */
export function readRegistryPage(text: string): RegistryPage | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const rec = asRecord(json);
  if (!rec || !Array.isArray(rec.servers)) return null;
  const read = rec.servers.map(readEntry);
  return { entries: read.filter((e): e is RegistryEntry => e !== null), invalid: read.filter((e) => e === null).length, nextCursor: str(asRecord(rec.metadata)?.nextCursor) };
}

/**
 * 서버마다 모든 버전이 나오므로 최신(isLatest)만 남긴다. 같은 이름이 둘이면 먼저 나온 것.
 * 올라간 시각은 같은 이름의 가장 이른 버전으로 바꾼다(새 버전을 낸 옛 서버가 "새로 나온 것"이 되지 않게).
 * shortcut: 한 서버의 버전이 두 쪽에 걸치면 이 쪽에서 본 것 중 가장 이른 시각. 걸친 서버가 NEW로 잘못 보이면 이름별 최소 시각을 따로 모은다
 */
export function onlyLatest(entries: RegistryEntry[]): RegistryEntry[] {
  const first = new Map<string, number>();
  for (const e of entries) {
    const t = e.publishedAt === null ? NaN : Date.parse(e.publishedAt);
    if (!Number.isNaN(t) && !(t >= (first.get(e.name) ?? Infinity))) first.set(e.name, t);
  }
  const seen = new Set<string>();
  return entries.filter((e) => e.isLatest && !seen.has(e.name) && seen.add(e.name))
    .map((e) => ({ ...e, publishedAt: first.has(e.name) ? new Date(first.get(e.name)!).toISOString() : null }));
}

const usable = (id: string) => /^\S+$/.test(id);

/** 기술 키(ADR 0019): npm 패키지가 있으면 npm:, 없고 PyPI가 있으면 pypi:, 아니면 mcp:<레지스트리 이름>. 사용자 저장소가 만드는 키와 같아 한 줄로 합쳐진다. */
function keyOf(e: RegistryEntry): string {
  const npm = e.packages.find((p) => p.registryType === "npm" && usable(p.identifier));
  if (npm) return npmKey(npm.identifier).key;
  const pypi = e.packages.find((p) => p.registryType === "pypi" && usable(p.identifier));
  if (pypi) return pypiKey(pypi.identifier).key;
  return `mcp:${e.name.toLowerCase()}`;
}

/** 공백을 한 칸으로 정리하고 max자에서 자른다. 비면 null. */
function tidy(text: string | null, max: number): string | null {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (s === "") return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** 저장소 주소는 https만(게시자가 적는 글이라 다른 방식의 주소는 저장하지 않는다). */
function httpsUrl(v: string | null): string | null {
  try {
    return v !== null && new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

/** 레지스트리 항목 → 얇은 기술 줄에 담을 값. deleted는 출처가 직접 지웠다는 뜻이라 gone(사라짐)으로 둔다. */
export function techFromEntry(e: RegistryEntry): TechDraft {
  return { techKey: keyOf(e), displayName: tidy(e.title, MAX_DISPLAY_NAME) ?? tidy(e.name, MAX_DISPLAY_NAME)!, oneLiner: tidy(e.description, MAX_ONE_LINER), repoUrl: httpsUrl(e.repoUrl), status: e.status === "deleted" ? "gone" : e.status };
}

/**
 * 공식 조직인가. 서버 이름의 이름공간(/ 앞쪽 전체)이 목록의 값과 **전체가 같을 때**만이다(`io.github.openai`, `com.openai` 꼴, 대소문자 무시).
 * 레지스트리가 이름공간을 검증한다(io.github.<소유자>는 GitHub 인증, 도메인 이름은 DNS 확인). 낱말(`openai`)만 맞추면 dev.openai 처럼 아무 최상위 도메인이나 통과한다.
 * 일부만 맞는 이름(com.example.openai 처럼 내 도메인의 하위 이름, 더 길거나 앞에 붙은 이름)과 서버 이름(/ 뒤쪽)은 아니다.
 * 게시자가 적는 저장소 주소는 이름공간과 맞는지 검증되지 않아 증거가 아니다(남의 조직 저장소를 적어도 공식이 되면 안 됨).
 */
export function isOfficialOrg(e: RegistryEntry, namespaces: string[]): boolean {
  const namespace = e.name.toLowerCase().split("/")[0];
  return namespaces.some((n) => n.toLowerCase() === namespace);
}

/** 한 줄 설명의 출처 링크(관문 3: 근거 링크 없는 정보는 저장하지 않는다). */
export const REGISTRY_BASE = "https://registry.modelcontextprotocol.io/";
export const registryLink = (name: string): string => `${REGISTRY_BASE}v0.1/servers?search=${encodeURIComponent(name)}`;

/**
 * 대량 채우기 표시(signals.registry_backfill)가 생긴 때. 그 전에 레지스트리에서 들어온 줄은 표시가 없어도 모두 대량 채우기였다
 * (11-20 운영 확인: 공개 목록 11,565개 모두 레지스트리 출처, 첫 전체 읽기는 11-19부터 진행 중이라 이 표시가 배포되기 전까지 들어온 것도 그렇다).
 * shortcut: 배포가 이 시각보다 늦으면 그 사이 줄은 표시 없이 NEW가 될 수 있다. 그러면 이 값을 배포 시각 뒤로 옮긴다
 */
export const BULK_MARK_SINCE = "2026-11-24T00:00:00Z";
type BulkRow = { created_at?: unknown; one_liner_source?: unknown; signals?: unknown };
/** 들어온 날이 "새로 나온 날"이 아닌 줄(레지스트리 대량 채우기). 지도 NEW · 새 기술 · 적용 기회의 "등록 뒤에 들어옴"이 함께 쓴다 */
export function isBulkFilled(r: BulkRow): boolean {
  const mark = asRecord(r.signals)?.registry_backfill;
  if (typeof mark === "boolean") return mark;
  return String(r.one_liner_source ?? "").startsWith(REGISTRY_BASE) && Date.parse(String(r.created_at)) < Date.parse(BULK_MARK_SINCE);
}
/** isBulkFilled의 반대를 PostgREST 조건으로(목록을 최근 순으로 잘라 읽을 때 DB에서 거른다) */
export const NOT_BULK_FILTER =
  `signals->>registry_backfill.eq.false,and(signals->>registry_backfill.is.null,or(one_liner_source.not.like."${REGISTRY_BASE}*",created_at.gte.${BULK_MARK_SINCE}))`;

export type RegistryDraft = TechDraft & { official: boolean; source: string; bulk?: boolean };
/** DB에서 읽은 기존 기술 줄 중 합칠 때 보는 칸 */
export type ExistingTech = { depth: string; status: string; thick_reasons: string[] | null; one_liner: string | null; one_liner_source: string | null; repo_url: string | null; is_official: boolean };

export const draftOf = (e: RegistryEntry, orgs: string[]): RegistryDraft => ({ ...techFromEntry(e), official: isOfficialOrg(e, orgs), source: registryLink(e.name) });

/**
 * 새 기술 줄: 얇게(공식 조직이면 두껍게, ADR 0019). 설명이 없으면 출처 링크도 없다.
 * bulk = 첫 전체 읽기(대량 채우기)에서 그 읽기를 시작하기 전에 이미 올라와 있던 서버: 들어온 날이 "새로 나온 날"이 아니라서 NEW에서 뺀다(isBulkFilled)
 */
export function rowFor(d: RegistryDraft) {
  return {
    tech_key: d.techKey, display_name: d.displayName, type: "mcp", depth: d.official ? "thick" : "thin", thick_reasons: d.official ? ["official"] : null,
    status: d.status, one_liner: d.oneLiner, one_liner_source: d.oneLiner ? d.source : null, repo_url: d.repoUrl, is_official: d.official,
    signals: { registry_backfill: d.bulk === true },
  };
}

type Patch = Record<string, unknown>;

/** 상태는 레지스트리가 정한 것만 바꾼다: 중단·삭제는 늘 반영하고, active는 중단·사라짐을 되돌릴 때만(다른 출처가 정한 dormant는 그대로). */
function statusPatch(ex: ExistingTech, d: RegistryDraft): Patch {
  const moves = d.status !== ex.status && (d.status !== "active" || ex.status === "deprecated" || ex.status === "gone");
  return moves ? { status: d.status } : {};
}

/** 비어 있는 설명·출처 링크·저장소 주소만 채운다. 이 서버가 직접 적은 설명(출처 링크가 같음)만 바뀐 값으로 새로 고친다. */
function fillPatch(ex: ExistingTech, d: RegistryDraft): Patch {
  const patch: Patch = {};
  const mine = ex.one_liner_source === d.source;
  if (d.oneLiner !== null && (ex.one_liner === null || (mine && ex.one_liner !== d.oneLiner))) {
    patch.one_liner = d.oneLiner;
    patch.one_liner_source = d.source;
  }
  if (ex.repo_url === null && d.repoUrl !== null) patch.repo_url = d.repoUrl;
  return patch;
}

/** 공식 조직이면 두껍게(이유 official), 이미 두꺼우면 이유만 더한다. */
function officialPatch(ex: ExistingTech, d: RegistryDraft): Patch {
  if (!d.official) return {};
  const patch: Patch = {};
  if (!ex.is_official) patch.is_official = true;
  const reasons = ex.thick_reasons ?? [];
  if (!reasons.includes("official")) patch.thick_reasons = [...reasons, "official"];
  if (ex.depth !== "thick") patch.depth = "thick";
  return patch;
}

/**
 * 이미 있는 줄에서 고칠 칸만(없으면 빈 객체 = 쓰지 않음, 같은 걸 다시 읽어도 안 늘어남).
 * 사용자 저장소가 먼저 만든 줄을 덮어쓰지 않는다: 비어 있는 칸만 채우고, 두께는 공식 조직일 때만 올린다.
 * shortcut: 같은 패키지를 가리키는 서버가 여럿이면(런처 패키지) 줄 하나를 나눠 쓰고 마지막으로 읽은 서버의 상태가 이긴다. P-9b가 상태의 주인을 정할 때 다시 본다.
 */
export function patchFor(ex: ExistingTech, d: RegistryDraft): Patch {
  return { ...statusPatch(ex, d), ...fillPatch(ex, d), ...officialPatch(ex, d) };
}
