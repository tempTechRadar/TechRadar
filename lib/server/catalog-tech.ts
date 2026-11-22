// 지도의 어느 기술이든 여는 상세(design.md 17절 2차 "지도의 모든 기술에 상세가 열림"). 주인: 김영식(A).
// 로그인한 사용자의 클라이언트로 읽는다(내 기술 · 내 판단 기록은 owner_id · user_id + RLS, 불변 5).
// 남의 비공개 저장소에서 생긴 줄은 id를 알아도 열지 않는다(ADR 0029 4항): 공개 목록 기술이거나, 내가 쓰는(숨기지 않은) 기술이거나, 내가 판단을 남긴 기술만.
// 읽기에 실패하면 던진다: 화면이 "없음"과 "읽지 못함"을 다르게 보여야 한다(불변 2).
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import { isListed, listedTechs } from "./map-queries.ts";

type Row = Record<string, any>;
export type CatalogTechDetail = {
  tech: {
    id: string; techKey: string; name: string; type: string; status: string; grade: "pass" | "caution" | "danger" | "unknown"; gradeReason: string | null;
    oneLiner: string | null; repoUrl: string | null; license: string | null; lastActivityAt: string | null; lastActivityKind: string | null;
    isOfficial: boolean; lastCheckedOkAt: string | null; collectErrorKind: string | null;
  };
  /** 이 기술을 쓰는 내 줄(내 기술 상세로 가는 길). 보관한 프로젝트 것은 뺀다 */
  mine: { id: string; projectName: string }[];
  /** 관리자가 확인한 비교군(같은 역할). 이유 글이 비었으면 null */
  peers: { id: string; name: string; grade: string; quote: string | null; confirmedAt: string | null }[];
  /** 이 기술에 대한 내 지도 판단 기록(최근 것부터) */
  events: { at: string; status: "interest" | "candidate" | "hold" | null; reason: string | null }[];
};

const COLUMNS = "id, tech_key, display_name, type, status, grade, grade_reason, one_liner, one_liner_source, repo_url, license, last_activity_at, last_activity_kind, is_official, last_checked_ok_at, collect_error_kind, is_simulated";
const fail = (what: string, e: { message: string }) => new Error(`${what}: ${maskSecrets(e.message)}`);

/** 없거나 볼 수 없으면 null(화면은 404), 읽기에 실패하면 던진다 */
/** user = null은 로그인 전(P-12f 손님): db는 서버 키, 카탈로그 공개 목록의 칸만 읽고 내 줄 · 내 판단은 읽지 않는다(빈 목록, 불변 5) */
export async function getCatalogTechDetail(db: SupabaseClient, user: { id: string; isDemo: boolean } | null, techId: string): Promise<CatalogTechDetail | null> {
  const none = Promise.resolve({ data: [] as Row[], error: null });
  const [t, mine, ev] = await Promise.all([
    db.from("technologies").select(COLUMNS).eq("id", techId).maybeSingle(),
    // 지도와 같은 "내 기술": 숨기지 않았고 보관하지 않은 프로젝트의 줄
    user ? db.from("my_technologies").select("id, projects!inner(name, archived_at)").eq("owner_id", user.id).eq("tech_id", techId).is("hidden_at", null).is("projects.archived_at", null) : none,
    user ? db.from("tech_mark_events").select("created_at, new_status, reason").eq("user_id", user.id).eq("tech_id", techId).order("created_at", { ascending: false }).limit(20) : none,
  ]);
  const isDemo = user?.isDemo ?? false;
  for (const [r, what] of [[t, "기술을 읽지 못함"], [mine, "사용 중인 항목을 읽지 못함"], [ev, "내 판단 기록을 읽지 못함"]] as const) if (r.error) throw fail(what, r.error);
  const row = t.data as Row | null;
  if (!row) return null;
  const mineRows = (mine.data ?? []) as Row[];
  const events = (ev.data ?? []) as Row[];
  // 공개 목록 밖이고 내 것도 아니고 내가 판단한 적도 없으면 "없음"과 같게(있는지도 알리지 않음). 판단을 남긴 기술은 사라져도 내 기록을 볼 수 있게
  if (!isListed(row, isDemo) && mineRows.length === 0 && events.length === 0) return null;

  const [ra, rb] = await Promise.all([
    db.from("tech_relations").select("tech_b, quote, confirmed_at").eq("tech_a", techId).eq("kind", "same_role").eq("status", "confirmed"),
    db.from("tech_relations").select("tech_a, quote, confirmed_at").eq("tech_b", techId).eq("kind", "same_role").eq("status", "confirmed"),
  ]);
  for (const r of [ra, rb]) if (r.error) throw fail("비교군을 읽지 못함", r.error);
  const rel = [...((ra.data ?? []) as Row[]).map((r) => ({ id: r.tech_b, quote: r.quote, at: r.confirmed_at })), ...((rb.data ?? []) as Row[]).map((r) => ({ id: r.tech_a, quote: r.quote, at: r.confirmed_at }))];
  let peers: CatalogTechDetail["peers"] = [];
  if (rel.length) {
    // 비교군도 같은 공개 규칙(남의 비공개 저장소에서 생긴 이름이 비교군으로 새지 않게)
    const p = await listedTechs(db, "id, display_name, grade", isDemo).in("id", rel.map((r) => r.id));
    if (p.error) throw fail("비교군 기술을 읽지 못함", p.error);
    const byId = new Map(((p.data ?? []) as Row[]).map((x) => [x.id as string, x]));
    peers = rel.flatMap((r) => (byId.has(r.id) ? [{ id: r.id, name: byId.get(r.id)!.display_name, grade: byId.get(r.id)!.grade, quote: r.quote ?? null, confirmedAt: r.at ?? null }] : []));
  }
  return {
    tech: {
      id: row.id, techKey: row.tech_key, name: row.display_name, type: row.type, status: row.status, grade: row.grade, gradeReason: row.grade_reason,
      oneLiner: row.one_liner, repoUrl: row.repo_url, license: row.license, lastActivityAt: row.last_activity_at, lastActivityKind: row.last_activity_kind,
      isOfficial: row.is_official === true, lastCheckedOkAt: row.last_checked_ok_at, collectErrorKind: row.collect_error_kind,
    },
    mine: mineRows.map((m) => ({ id: m.id, projectName: m.projects?.name ?? "" })),
    peers,
    events: events.map((e) => ({ at: e.created_at, status: e.new_status, reason: e.reason })),
  };
}
