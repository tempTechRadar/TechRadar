// 첫 화면 기술 지도(IA-10)가 쓰는 자료 읽기. 주인: 김영식(A). 로그인한 사용자의 클라이언트로 부른다(내 기술은 owner_id + RLS, 불변 5).
// 로그인 전 지도(readGuestMapInput)만 서비스 키로 읽는다(ADR 0029): 공용 카탈로그의 아래 공개 칸만, 개인 표는 읽지 않는다.
// 읽기에 실패하면 던진다: 화면이 "아직 없음"과 "읽지 못함"을 다르게 보여 줘야 한다(불변 2와 같은 이유).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogTech, Category, Grade, MapInput, Mark, MyTechRow, Relation } from "../map/build-map.ts";
import { rowsOrThrow, type Row } from "./alert-db.ts";
import { isBulkFilled, NOT_BULK_FILTER } from "../domain/registry.ts";
import { fixedNote } from "../domain/services.ts";

/** 지도에 한 번에 올릴 모은 기술의 최대 수(운영 1만 5천여 개를 다 그리지 않는다, 나머지는 지도 찾기 칸으로). 내 기술·비교군은 이 수와 따로 늘 들어간다.
 *  11-21 사용자 결정으로 1,200 → 500(한눈에 받아들일 수 있는 양, ADR 0030). shortcut: 고정 개수, 더 많이 보여야 하면 보이는 영역만 서버에서 읽는다 */
export const CATALOG_LIMIT = 500;
/** id 목록을 주소에 싣는 읽기는 이만큼씩 나눈다(uuid 36자, 주소가 너무 길면 거절됨) */
export const ID_CHUNK = 40;
/** 카탈로그를 처음 채운 때(레지스트리 첫 동기화, 운영 11-19). 이때 들어온 것은 NEW가 아니다.
 *  shortcut: 고정 시각, 카탈로그를 다시 처음부터 채우면 이 값을 바꾼다 */
export const CATALOG_FIRST_FILL = "2026-11-20T00:00:00Z";
/** 지도가 쓰는 기술 칸 = 로그인 전에도 내보내는 공개 칸(ADR 0029). 등급 근거 원문·두께 이유·상태를 정한 주체 같은 내부 칸은 넣지 않는다 */
export const TECH_COLUMNS = "id, tech_key, created_at, display_name, type, hosts, category_id, grade, grade_reason, one_liner, repo_url, license, last_activity_at, last_activity_kind, last_checked_ok_at, collect_error_kind, signals, status, depth, is_simulated, is_official";

/** NEW를 정하려고 서버에서만 더 읽는 칸. toTech가 버려서 화면 · 캐시로 나가지 않는다(공개 칸은 TECH_COLUMNS 그대로) */
const READ_COLUMNS = `${TECH_COLUMNS}, one_liner_source`;

// 연동 서비스 · 개념은 카탈로그에 설명을 쓰지 않고 정해 둔 글로(ADR 0029 4항). createdAt은 NEW 기준으로만 쓴다. 레지스트리 대량 채우기분은 null(11-20 하루에 3,700여 개가 NEW가 됐던 일)
const toTech = (r: Row): CatalogTech => ({
  id: r.id, techKey: r.tech_key, createdAt: isBulkFilled(r) ? null : r.created_at, name: r.display_name, type: r.type, hosts: r.hosts, categoryId: r.category_id, grade: r.grade as Grade, gradeReason: r.grade_reason,
  oneLiner: r.one_liner ?? fixedNote(r.tech_key)?.text ?? null, repoUrl: r.repo_url, license: r.license ?? null, lastActivityAt: r.last_activity_at, lastActivityKind: r.last_activity_kind,
  lastCheckedOkAt: r.last_checked_ok_at, collectErrorKind: r.collect_error_kind, official: r.is_official === true,
  signals: { stars: r.signals?.stars ?? null, weekly_downloads: r.signals?.weekly_downloads ?? null }, // 수집 오류 문장 같은 나머지는 화면·캐시로 보내지 않는다(ADR 0029)
});
const toMine = (r: Row): MyTechRow => ({
  id: r.id, techId: r.tech_id, manualName: r.manual_name, projectId: r.project_id, projectName: r.projects?.name ?? "", sourceFile: r.source_file ?? null,
  grade: r.grade as Grade, gradeReason: r.grade_reason, collectErrorKind: r.collect_error_kind, lastCheckedOkAt: r.last_checked_ok_at,
});
export const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / ID_CHUNK) }, (_, i) => ids.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK));

/**
 * 공개 목록에서 온 기술만(ADR 0029 4·5항): 사라진 기술 · 누군가의 저장소에서만 생긴 줄을 빼고, 시뮬레이터 기술은 시연 계정에만.
 * 이 규칙은 이 두 곳에만 둔다(DB 조건 listedTechs, 이미 읽은 줄 isListed): 카탈로그 · 새 기술 · 기술 넣기 · 추천 · 기술 상세 · 비교군이 함께 쓴다
 */
export const listedTechs = (db: SupabaseClient, columns: string, isDemo = false) => {
  const q = db.from("technologies").select(columns).neq("status", "gone").not("one_liner_source", "is", null);
  return isDemo ? q : q.eq("is_simulated", false);
};
export const isListed = (r: { status?: unknown; one_liner_source?: unknown; is_simulated?: unknown }, isDemo = false) =>
  r.status !== "gone" && r.one_liner_source != null && (isDemo || r.is_simulated !== true);
export const publicTechs = (db: SupabaseClient, columns: string) => listedTechs(db, columns);

export async function readCategories(db: SupabaseClient): Promise<Category[]> {
  return rowsOrThrow(await db.from("categories").select("id, name, parent_id"), "갈래를 읽지 못함").map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id }));
}

/** 개발 분야(11-21 사용자: 부트캠프 교육생 · 나 같은 사용자에게 맞는 것 먼저). 큰 갈래 이름(categories 시드)과 그 아래 세부 갈래, 그리고 종류.
 *  shortcut: 갈래를 이름으로 찾는다 — 관리자가 큰 갈래 이름을 바꾸면 여기와 PICK_RULE을 같이 고친다(갈래 키 칸이 생기면 키로) */
const DEV_FIELDS = ["프론트엔드", "백엔드·데이터", "검사·보안", "배포·운영", "AI 작업 방식", "기획·문서"];
const DEV_TYPES = ["skill", "plugin", "concept"]; // 개발 도구(sdk)는 입문 세트 몫으로 늘 들어간다(여기 넣으면 저장소에서 생긴 sdk 줄 전체가 개발 분야가 됨)
/** 늘 넣는 몫: 위험 · 주의(시연 계정의 시뮬레이터 위험 등, 이것만으로 지도가 차지 않게), 입문 세트(signals.starter_set, 별이 없어 별 순에 밀리므로),
 *  이번 주 새 기술(NEW 표시 15개를 고를 몫) */
export const STARTER_MAX = 80; // 입문 세트가 이보다 많아지면 잘린다 — 시드 시험(starter-set-migration.test.ts)은 그 시드 파일의 줄 수만 막는다(다른 마이그레이션 · 관리자가 starter_set을 켜면 따로 세어 볼 것)
const RISKY_MAX = 100, NEW_QUOTA = 60;
/** 고르는 규칙이 바뀌면 올린다(로그인 전 지도 캐시 키) */
export const PICK_RULE = "dev-first-5";

const devCategoryIds = (cats: Category[]) => {
  const tops = new Set(cats.filter((c) => !c.parentId && DEV_FIELDS.includes(c.name)).map((c) => c.id));
  return cats.filter((c) => tops.has(c.id) || (c.parentId !== null && tops.has(c.parentId))).map((c) => c.id);
};
/** days일 전과 처음 채운 날 중 늦은 때. 지도는 기간 칩의 가장 긴 것(이번 달 = 30일)까지 새 기술 몫으로 읽고(NEW 표시는 그중 7일 안만, build-map isNewTech), 새 기술 화면은 7일 */
const sinceDays = (now: Date, days: number) => { const at = new Date(now.getTime() - days * 86_400_000).toISOString(); return at > CATALOG_FIRST_FILL ? at : CATALOG_FIRST_FILL; };

/**
 * 지도에 올릴 모은 기술 CATALOG_LIMIT개(ADR 0030 8항): ① 위험 → 주의(RISKY_MAX까지) ② 입문 세트(STARTER_MAX까지) ③ 최근 30일 새 기술(최근 것부터 NEW_QUOTA까지, 대량 채우기분 제외)
 * ④ 개발 분야 · 스킬 · 플러그인 · 개념을 두꺼운 것 → 별 많은 순 ⑤ 자리가 남으면 나머지를 같은 순(생활 · 업무 연동 등). 겹치면 한 번.
 * 사라진 기술, (시연 계정이 아니면) 시뮬레이터 기술은 뺀다. 공개 목록(소개 출처가 있음)만(불변 5, ADR 0029). 내 기술은 readMapInput이 id로 따로 읽어 늘 보인다
 */
async function readCatalog(db: SupabaseClient, isDemo: boolean, cats: Category[]): Promise<CatalogTech[]> {
  const listed = () => listedTechs(db, READ_COLUMNS, isDemo);
  // 두꺼운 것 먼저(글자순 thick < thin), 별이 많은 순(없으면 뒤로), 같으면 최근에 들어온 것
  const ranked = <Q extends ReturnType<typeof listed>>(q: Q) => q.order("depth").order("signals->stars", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).order("id");
  const ids = devCategoryIds(cats), devFilter = [`type.in.(${DEV_TYPES.join(",")})`, ...(ids.length ? [`category_id.in.(${ids.join(",")})`] : [])].join(",");
  const [risky, starter, fresh, dev] = await Promise.all([
    listed().or("grade.eq.danger,grade.eq.caution").order("grade", { ascending: false }).order("depth").order("id").limit(RISKY_MAX), // 글자 내림차순: danger 먼저
    listed().eq("signals->>starter_set", "true").order("type").order("id").limit(STARTER_MAX),
    listed().gt("created_at", sinceDays(new Date(), 30)).or(NOT_BULK_FILTER).order("created_at", { ascending: false }).order("id").limit(NEW_QUOTA),
    ranked(listed().or(devFilter)).limit(CATALOG_LIMIT),
  ]);
  const seen = new Set<string>(), pick = (r: { data: unknown; error: { message: string } | null }) => rowsOrThrow(r, "모은 기술을 읽지 못함").filter((x) => !seen.has(x.id) && seen.add(x.id));
  const rows = [...pick(risky), ...pick(starter), ...pick(fresh), ...pick(dev)];
  if (rows.length < CATALOG_LIMIT) rows.push(...pick(await ranked(listed()).limit(CATALOG_LIMIT))); // 개발 분야로 다 못 채웠을 때만(보통은 안 읽음)
  return rows.slice(0, CATALOG_LIMIT).map(toTech);
}

/** 새 기술 화면에 한 번에 읽는 최대 수(넘으면 화면이 "최근 n개만"이라고 알린다) */
export const NEW_LIMIT = 500;
/** 새 기술(/new, design.md 13절 3): 처음 채운 뒤·7일 안에 들어온 공개 목록 기술(레지스트리 대량 채우기분 제외)(최근 것부터 최대 NEW_LIMIT개)과 내 표시 */
/** userId가 null이면 로그인 전(11-21 사용자 결정: 새 기술도 로그인 없이): 서비스 키로 공개 목록만 읽고 내 표시는 없다(ADR 0029) */
export async function readNewTechs(db: SupabaseClient, userId: string | null, now: Date): Promise<MapInput> {
  const since = sinceDays(now, 7);
  const [categories, techRes, markRes] = await Promise.all([
    readCategories(db),
    // 대량 채우기분은 DB에서 뺀다: 최근 순으로 잘라 읽어서, 읽은 뒤 거르면 대량분이 자리를 다 차지한다
    publicTechs(db, READ_COLUMNS)
      .gt("created_at", since).or(NOT_BULK_FILTER).order("created_at", { ascending: false }).order("id").limit(NEW_LIMIT),
    userId ? db.from("tech_marks").select("tech_id, status, reason").eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
  ]);
  const marks: Mark[] = rowsOrThrow(markRes, "내 판단 표시를 읽지 못함").map((r) => ({ techId: r.tech_id, status: r.status, reason: r.reason }));
  return { mine: [], techs: rowsOrThrow(techRes, "새 기술을 읽지 못함").map(toTech), relations: [], categories, marks, newSince: CATALOG_FIRST_FILL };
}

/** 로그인 전 지도(ADR 0029): 누구에게나 같은 카탈로그. 서비스 키 클라이언트로 부르되 공용 표(technologies·categories)의 공개 칸만 읽는다 */
/** NEW 판정 규칙 판: 로그인 전 지도 · 새 기술 캐시 키에 넣는다. 규칙(isBulkFilled · NOT_BULK_FILTER)이 바뀌면 올려 옛 캐시를 안 쓴다 */
export const NEW_RULE_VERSION = "new-bulk-1";

/** 로그인 전 지도에 꼭 올릴 기술(새 기술의 "지도에서 보기" sel=): 1,200개 밖이어도 공개 목록 기술이면 */
export async function readListedByIds(db: SupabaseClient, ids: string[]): Promise<CatalogTech[]> {
  if (!ids.length) return [];
  return rowsOrThrow(await listedTechs(db, READ_COLUMNS).in("id", ids), "고른 기술을 읽지 못함").map(toTech);
}

export async function readGuestMapInput(db: SupabaseClient): Promise<MapInput> {
  const categories = await readCategories(db);
  const techs = await readCatalog(db, false, categories);
  return { mine: [], techs, relations: [], categories, newSince: CATALOG_FIRST_FILL };
}

/** 시뮬레이터가 넣은 기술·관계(is_simulated)는 시연 계정에만 보인다(SPEC-3.5). 내 기술 자체는 늘 보인다 */
/** extraIds: 카탈로그 500개 밖이어도 꼭 올릴 기술(주소의 sel=, 내 레이더·새 기술의 "지도에서 보기") */
export async function readMapInput(db: SupabaseClient, userId: string, isDemo: boolean, extraIds: string[] = []): Promise<MapInput> {
  const cats = readCategories(db); // 카탈로그 고르기(개발 분야)가 갈래를 쓴다: 한 번만 읽어 나눠 씀
  const [mineRes, categories, catalog, markRes] = await Promise.all([
    db.from("my_technologies")
      .select("id, tech_id, manual_name, project_id, source_file, grade, grade_reason, collect_error_kind, last_checked_ok_at, projects!inner(name, archived_at)")
      .eq("owner_id", userId).is("hidden_at", null).is("projects.archived_at", null).order("created_at").order("id"), // 같은 등급끼리 합칠 때 늘 같은 줄이 앞에
    cats,
    cats.then((c) => readCatalog(db, isDemo, c)), // 로그인 뒤에도 기본은 전체 지도(ADR 0027)
    db.from("tech_marks").select("tech_id, status, reason").eq("user_id", userId),
  ]);
  const mine = rowsOrThrow(mineRes, "내 기술을 읽지 못함").map(toMine);
  const marks: Mark[] = rowsOrThrow(markRes, "내 판단 표시를 읽지 못함").map((r) => ({ techId: r.tech_id, status: r.status, reason: r.reason }));
  const ids = [...new Set(mine.map((m) => m.techId).filter((x): x is string => !!x))];
  const relRows = (await Promise.all(chunks(ids).map((c) => {
    let q = db.from("tech_relations").select("tech_a, tech_b, quote").eq("kind", "same_role").eq("status", "confirmed").or(`tech_a.in.(${c.join(",")}),tech_b.in.(${c.join(",")})`);
    if (!isDemo) q = q.eq("is_simulated", false);
    return q;
  }))).flatMap((res) => rowsOrThrow(res, "같은 역할을 읽지 못함"));
  const relations: Relation[] = [...new Map(relRows.map((r) => [`${r.tech_a}|${r.tech_b}`, { a: r.tech_a as string, b: r.tech_b as string, quote: (r.quote as string | null) ?? null }])).values()];
  const have = new Set(catalog.map((t) => t.id));
  // 내 기술 · 비교군 · 내가 표시한 기술 · 꼭 올릴 기술은 1,200개 밖이어도 올린다(내 레이더에서 "지도에서 보기"가 늘 열리게)
  const missing = [...new Set([...ids, ...relations.flatMap((r) => [r.a, r.b]), ...marks.map((m) => m.techId), ...extraIds])].filter((id) => !have.has(id));
  const techRows = (await Promise.all(chunks(missing).map((c) => db.from("technologies").select(READ_COLUMNS).in("id", c))))
    .flatMap((res) => rowsOrThrow(res, "기술 정보를 읽지 못함"));
  const myIds = new Set(ids);
  // 둘레의 비교군은 쓸 수 있는 대안만: 사라진 기술·(시연 계정이 아니면) 시뮬레이터 기술은 뺀다. 얇은 기술은 남긴다(운영은 두꺼운 기술이 3개뿐이라 빼면 비교군이 거의 사라짐)
  const usable = (r: Row) => myIds.has(r.id) || (r.status !== "gone" && (isDemo || !r.is_simulated));
  return { mine, techs: [...catalog, ...techRows.filter(usable).map(toTech)], relations, categories, marks, newSince: CATALOG_FIRST_FILL };
}
