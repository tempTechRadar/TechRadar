// 첫 화면 기술 지도(IA-10)가 쓰는 자료 읽기. 주인: 김영식(A). 로그인한 사용자의 클라이언트로 부른다(내 기술은 owner_id + RLS, 불변 5).
// 로그인 전 지도(readGuestMapInput)만 서비스 키로 읽는다(ADR 0029): 공용 카탈로그의 아래 공개 칸만, 개인 표는 읽지 않는다.
// 읽기에 실패하면 던진다: 화면이 "아직 없음"과 "읽지 못함"을 다르게 보여 줘야 한다(불변 2와 같은 이유).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogTech, Category, Grade, MapInput, MyTechRow } from "../map/build-map.ts";
import { rowsOrThrow, type Row } from "./alert-db.ts";

/** 프로젝트가 없을 때 갈래별로 보여 줄 모은 기술의 최대 수. shortcut: 고정 개수, 카탈로그가 커지면 갈래 안 순위로 나눠 읽는다 */
export const CATALOG_LIMIT = 300;
/** id 목록을 주소에 싣는 읽기는 이만큼씩 나눈다(uuid 36자, 주소가 너무 길면 거절됨) */
export const ID_CHUNK = 40;
/** 지도가 쓰는 기술 칸 = 로그인 전에도 내보내는 공개 칸(ADR 0029). 등급 근거 원문·두께 이유·상태를 정한 주체 같은 내부 칸은 넣지 않는다 */
export const TECH_COLUMNS = "id, tech_key, created_at, display_name, type, hosts, category_id, grade, grade_reason, one_liner, repo_url, last_activity_at, last_activity_kind, last_checked_ok_at, collect_error_kind, signals, status, depth, is_simulated";

const toTech = (r: Row): CatalogTech => ({
  id: r.id, techKey: r.tech_key, createdAt: r.created_at, name: r.display_name, type: r.type, hosts: r.hosts, categoryId: r.category_id, grade: r.grade as Grade, gradeReason: r.grade_reason,
  oneLiner: r.one_liner, repoUrl: r.repo_url, lastActivityAt: r.last_activity_at, lastActivityKind: r.last_activity_kind,
  lastCheckedOkAt: r.last_checked_ok_at, collectErrorKind: r.collect_error_kind,
  signals: { stars: r.signals?.stars ?? null, weekly_downloads: r.signals?.weekly_downloads ?? null }, // 수집 오류 문장 같은 나머지는 화면·캐시로 보내지 않는다(ADR 0029)
});
const toMine = (r: Row): MyTechRow => ({
  id: r.id, techId: r.tech_id, manualName: r.manual_name, projectId: r.project_id, projectName: r.projects?.name ?? "",
  grade: r.grade as Grade, gradeReason: r.grade_reason, collectErrorKind: r.collect_error_kind, lastCheckedOkAt: r.last_checked_ok_at,
});
const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / ID_CHUNK) }, (_, i) => ids.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK));

async function readCategories(db: SupabaseClient): Promise<Category[]> {
  return rowsOrThrow(await db.from("categories").select("id, name, parent_id"), "갈래를 읽지 못함").map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id }));
}

/**
 * 모은 기술을 갈래별로(UJ-A2): 두꺼운 것 먼저, 얇은 것은 최근에 들어온 순. 사라진 기술, (시연 계정이 아니면) 시뮬레이터 기술은 뺀다.
 * 공개 목록(레지스트리 등)에서 온 기술만(소개 출처가 있음): 누군가의 비공개 저장소에서 읽혀 생긴 줄(내부 주소·비공개 패키지 이름)은
 * 남의 카탈로그·로그인 전 지도에 나오지 않는다(불변 5, ADR 0029). 내 기술은 readMapInput이 id로 따로 읽어 늘 보인다
 */
async function readCatalog(db: SupabaseClient, isDemo: boolean): Promise<CatalogTech[]> {
  let q = db.from("technologies").select(TECH_COLUMNS).neq("status", "gone").not("one_liner_source", "is", null);
  if (!isDemo) q = q.eq("is_simulated", false);
  const res = await q.order("depth").order("created_at", { ascending: false }).order("id").limit(CATALOG_LIMIT); // depth: thick < thin
  return rowsOrThrow(res, "모은 기술을 읽지 못함").map(toTech);
}

/** 로그인 전 지도(ADR 0029): 누구에게나 같은 카탈로그. 서비스 키 클라이언트로 부르되 공용 표(technologies·categories)의 공개 칸만 읽는다 */
export async function readGuestMapInput(db: SupabaseClient): Promise<MapInput> {
  const [categories, techs] = await Promise.all([readCategories(db), readCatalog(db, false)]);
  return { mine: [], techs, relations: [], categories };
}

/** 시뮬레이터가 넣은 기술·관계(is_simulated)는 시연 계정에만 보인다(SPEC-3.5). 내 기술 자체는 늘 보인다 */
export async function readMapInput(db: SupabaseClient, userId: string, isDemo: boolean): Promise<MapInput> {
  const [mineRes, categories] = await Promise.all([
    db.from("my_technologies")
      .select("id, tech_id, manual_name, project_id, grade, grade_reason, collect_error_kind, last_checked_ok_at, projects!inner(name, archived_at)")
      .eq("owner_id", userId).is("hidden_at", null).is("projects.archived_at", null).order("created_at").order("id"), // 같은 등급끼리 합칠 때 늘 같은 줄이 앞에
    readCategories(db),
  ]);
  const mine = rowsOrThrow(mineRes, "내 기술을 읽지 못함").map(toMine);
  if (!mine.length) return { mine, techs: await readCatalog(db, isDemo), relations: [], categories }; // 프로젝트(내 기술)가 없으면 카탈로그

  const ids = [...new Set(mine.map((m) => m.techId).filter((x): x is string => !!x))];
  const relRows = (await Promise.all(chunks(ids).map((c) => {
    let q = db.from("tech_relations").select("tech_a, tech_b").eq("kind", "same_role").eq("status", "confirmed").or(`tech_a.in.(${c.join(",")}),tech_b.in.(${c.join(",")})`);
    if (!isDemo) q = q.eq("is_simulated", false);
    return q;
  }))).flatMap((res) => rowsOrThrow(res, "같은 역할을 읽지 못함"));
  const relations = [...new Map(relRows.map((r) => [`${r.tech_a}|${r.tech_b}`, { a: r.tech_a as string, b: r.tech_b as string }])).values()];
  const all = [...new Set([...ids, ...relations.flatMap((r) => [r.a, r.b])])];
  const techRows = (await Promise.all(chunks(all).map((c) => db.from("technologies").select(TECH_COLUMNS).in("id", c))))
    .flatMap((res) => rowsOrThrow(res, "기술 정보를 읽지 못함"));
  const myIds = new Set(ids);
  // 둘레의 비교군은 쓸 수 있는 대안만: 사라진 기술·(시연 계정이 아니면) 시뮬레이터 기술은 뺀다. 얇은 기술은 남긴다(운영은 두꺼운 기술이 3개뿐이라 빼면 비교군이 거의 사라짐)
  const usable = (r: Row) => myIds.has(r.id) || (r.status !== "gone" && (isDemo || !r.is_simulated));
  return { mine, techs: techRows.filter(usable).map(toTech), relations, categories };
}
