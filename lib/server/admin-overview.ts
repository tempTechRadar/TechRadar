// 관리자 첫 화면 "관제 요약"(11-23 리뉴얼, docs/quality-loop/README.md 3항)의 숫자 읽기와 정리. 주인: 차세일(C).
// 읽기는 관리자 본인 권한 클라이언트(adminGate의 db)로만 한다(서비스 키 아님): 일반 계정이면 RLS가 0줄로 막는다(불변 5). 쓰기는 없다(불변 1).
// 숫자마다 따로 읽고 따로 실패한다: 하나를 못 읽어도 다른 숫자는 보이고, 못 읽은 숫자는 0이 아니라 "읽지 못함"이다(불변 2).
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import { kstTime, readScanStatus, type ScanStatus } from "./scan-status.ts";

export type Metric = { ok: true; value: number } | { ok: false; reason: string };
export type WeekRuns = { ok: true; total: number; failed: number; partial: number; capped: boolean } | { ok: false; reason: string };
export type OverviewData = {
  scan: ScanStatus;
  pendingAlerts: Metric;
  pendingReports: Metric;
  unclassified: Metric;
  relationCandidates: Metric;
  week: WeekRuns;
};

type CountAnswer = { count: number | null; error: { message: string; code?: string } | null };
const WEEK_LIMIT = 1000;
const DAY = 24 * 60 * 60 * 1000;

/** 건수 응답 하나를 숫자로. 오류이거나 건수가 비어 오면 0이 아니라 "읽지 못함"(불변 2) */
export function toMetric(res: CountAnswer, what: string): Metric {
  if (res.error) return { ok: false, reason: `${what}: ${maskSecrets(res.error.message)}` };
  if (typeof res.count !== "number") return { ok: false, reason: `${what}: 건수를 받지 못함` };
  return { ok: true, value: res.count };
}

/** 최근 7일 실행 줄(status만)을 세기. 1000줄에서 잘렸으면 capped(화면이 "이상"을 붙인다) */
export function summarizeWeek(rows: { status: string }[], limit = WEEK_LIMIT): WeekRuns {
  return { ok: true, total: rows.length, failed: rows.filter((r) => r.status === "failed").length, partial: rows.filter((r) => r.status === "partial").length, capped: rows.length >= limit };
}

/** 표가 아직 DB에 없다(42P01 · PostgREST PGRST205). 사용기 신고 표는 마이그레이션 적용 대기일 수 있다 */
const missingTable = (e: { message: string; code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|Could not find the table/i.test(e.message));

async function count(q: () => PromiseLike<CountAnswer>, what: string): Promise<Metric> {
  try { return toMetric(await q(), what); } catch (e) { return { ok: false, reason: `${what}: ${maskSecrets(e instanceof Error ? e.message : String(e))}` }; }
}

async function readReportsPending(db: SupabaseClient): Promise<Metric> {
  try {
    const res = await db.from("reports").select("id", { count: "exact", head: true }).is("handled_at", null);
    if (missingTable(res.error)) return { ok: false, reason: "사용기 신고 표가 아직 DB에 없음(마이그레이션 적용 대기)" };
    return toMetric(res, "처리 전 신고");
  } catch (e) { return { ok: false, reason: `처리 전 신고: ${maskSecrets(e instanceof Error ? e.message : String(e))}` }; }
}

async function readWeek(db: SupabaseClient, now: Date): Promise<WeekRuns> {
  try {
    const res = await db.from("runs").select("status").gte("created_at", new Date(now.getTime() - 7 * DAY).toISOString()).limit(WEEK_LIMIT);
    if (res.error || !res.data) return { ok: false, reason: `최근 7일 실행: ${maskSecrets(res.error?.message ?? "빈 응답")}` };
    return summarizeWeek(res.data as { status: string }[]);
  } catch (e) { return { ok: false, reason: `최근 7일 실행: ${maskSecrets(e instanceof Error ? e.message : String(e))}` }; }
}

async function readScan(db: SupabaseClient): Promise<ScanStatus> {
  try { return await readScanStatus(db); } catch { return { state: "fail" }; }
}

export async function readOverview(db: SupabaseClient, now = new Date()): Promise<OverviewData> {
  const [scan, pendingAlerts, pendingReports, unclassified, relationCandidates, week] = await Promise.all([
    readScan(db),
    count(() => db.from("alerts").select("id", { count: "exact", head: true }).eq("status", "pending"), "판단 대기 알림"),
    readReportsPending(db),
    // 분류 확인 화면(readClassify)과 같은 조건: 갈래가 비었고 두꺼운 줄(얇은 레지스트리 줄 수천 개는 빼고)
    count(() => db.from("technologies").select("id", { count: "exact", head: true }).is("category_id", null).eq("depth", "thick"), "갈래 빈 기술"),
    count(() => db.from("tech_relations").select("id", { count: "exact", head: true }).eq("status", "candidate"), "같은 역할 후보"),
    readWeek(db, now),
  ]);
  return { scan, pendingAlerts, pendingReports, unclassified, relationCandidates, week };
}

/* ---------- 화면에 놓을 숫자 타일로 정리(순수) ---------- */

export type Tone = "ok" | "warn" | "danger" | "unknown" | "neutral";
export type Tile = { key: string; label: string; value: string; sub?: string; tone: Tone; href: string; reason?: string };
export type TileGroup = { id: string; label: string; tiles: Tile[] };

const UNREAD = "읽지 못함";
const metricTile = (key: string, label: string, m: Metric, href: string, toneOf: (n: number) => Tone, sub?: string): Tile =>
  m.ok ? { key, label, value: String(m.value), tone: toneOf(m.value), href, sub } : { key, label, value: UNREAD, tone: "unknown", href, reason: m.reason };

function scanTiles(scan: ScanStatus, now: Date): Tile[] {
  if (scan.state !== "ok") {
    const value = scan.state === "none" ? "아직 없음" : UNREAD;
    const tone: Tone = scan.state === "none" ? "neutral" : "unknown";
    return [
      { key: "scan-at", label: "마지막 정기 실행", value, tone, href: "/admin/runs", reason: scan.state === "fail" ? "정기 실행 기록을 읽지 못했어요" : undefined },
      { key: "scan-errors", label: "수집 오류(마지막 정기 실행)", value, tone, href: "/admin/runs" },
    ];
  }
  const state = scan.runFailed ? "실행 실패" : scan.running ? "진행 중" : scan.otherFailed ? `처리 단계 실패 ${scan.otherFailed}` : "끝남";
  return [
    { key: "scan-at", label: "마지막 정기 실행", value: kstTime(scan.at, now), sub: `${state} · 출처 ${scan.sources}곳`, tone: scan.runFailed || scan.otherFailed ? "danger" : scan.running ? "neutral" : "ok", href: `/admin/flow?run=${encodeURIComponent(scan.runId)}` },
    { key: "scan-errors", label: "수집 오류(마지막 정기 실행)", value: String(scan.errors), sub: scan.errors ? "출처 단위 · 변화 없음으로 치지 않음" : "출처 단위", tone: scan.errors ? "danger" : "ok", href: "/admin/runs" },
  ];
}

function weekTile(w: WeekRuns): Tile {
  if (!w.ok) return { key: "week", label: "최근 7일 실행", value: UNREAD, tone: "unknown", href: "/admin/runs", reason: w.reason };
  return { key: "week", label: "최근 7일 실행", value: `${w.total}${w.capped ? "+" : ""}`, sub: `실패 ${w.failed} · 일부 실패 ${w.partial}`, tone: w.failed ? "danger" : w.partial ? "warn" : "ok", href: "/admin/runs" };
}

/** 관제 요약 숫자를 메뉴 묶음과 같은 순서로(지켜보기 · 사람 판단 · 운영 관리). 못 읽은 숫자는 "읽지 못함" + 이유 */
export function overviewTiles(d: OverviewData, now = new Date()): TileGroup[] {
  const waiting = (n: number): Tone => (n ? "warn" : "ok");
  return [
    { id: "watch", label: "지켜보기(자동)", tiles: [...scanTiles(d.scan, now), weekTile(d.week)] },
    { id: "human", label: "사람 판단 현황", tiles: [
      metricTile("alerts", "판단 대기 알림", d.pendingAlerts, "/admin/alerts?status=pending", waiting, "판단은 알림을 받은 본인만"),
      metricTile("reports", "처리 전 사용기 신고", d.pendingReports, "/admin/reports", waiting, "신고 건 기준"),
    ] },
    { id: "ops", label: "운영 관리(고치면 기록이 남음)", tiles: [
      metricTile("unclassified", "갈래 빈 기술", d.unclassified, "/admin/classify", waiting, "분류 확인 화면과 같은 기준"),
      metricTile("relations", "같은 역할 후보", d.relationCandidates, "/admin/classify", waiting, "관리자 확인 전"),
    ] },
  ];
}
