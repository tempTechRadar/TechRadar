// 레포 상세 페이지 /projects/[id](P-12k K2)와 보드 "보관함" 읽기. 사용자 토큰으로 본인 줄만(owner_id 조건 + RLS, 불변 5).
// 못 읽으면 던진다(화면이 "없음"과 "읽지 못함"을 다르게, 불변 2). 없거나 남의 것이면 null → 화면이 notFound(). 상대 경로 import: node --test가 `@/` 별칭을 못 읽는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import type { StatusProjectRow } from "../dashboard/status-view.ts";

export type RepoDetailRow = StatusProjectRow & { memo: string | null };
// 보드 진행 중 프로젝트 판(readStatusData)과 같은 칸 + 메모
const COLUMNS = "id, name, kind, repo_url, memo, repo_description, repo_language, repo_pushed_at, repo_meta_at, repo_meta_error, my_technologies(id, tech_id, manual_name, hidden_at, read_at, collect_error_kind, grade, source_file, technologies(display_name, tech_key, type)), runs!runs_project_id_fkey(status, created_at)";

/** 내 것 · 보관 안 한 레포 하나. 없거나 남의 것 · 보관한 것이면 null */
export async function readRepoDetail(db: SupabaseClient, userId: string, id: string): Promise<RepoDetailRow | null> {
  const res = await db.from("projects").select(COLUMNS).eq("id", id).eq("owner_id", userId).is("archived_at", null);
  if (res.error || !res.data) throw new Error(`레포를 읽지 못함: ${maskSecrets(res.error?.message ?? "빈 응답")}`);
  return ((res.data as unknown as RepoDetailRow[])[0] ?? null);
}

export type ArchivedRepo = { id: string; name: string; repo_url: string | null; archived_at: string };
/** 보관함(되살릴 저장소 프로젝트), 최근 보관한 것부터 */
export async function readArchivedRepos(db: SupabaseClient, userId: string): Promise<ArchivedRepo[]> {
  const res = await db.from("projects").select("id, name, repo_url, archived_at").eq("owner_id", userId).eq("kind", "repo").not("archived_at", "is", null).order("archived_at", { ascending: false });
  if (res.error || !res.data) throw new Error(`보관한 레포를 읽지 못함: ${maskSecrets(res.error?.message ?? "빈 응답")}`);
  return res.data as ArchivedRepo[];
}
