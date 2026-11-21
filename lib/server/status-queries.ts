// 현황 개요의 "내 레포 현황 · 적용한 기술" 읽기(P-12f ④). /projects와 같은 줄(보관 안 한 내 프로젝트 + 내 기술 + 읽기 실행)을 사용자 토큰으로 읽는다(본인만: owner_id 조건 + RLS, 불변 5).
// 프로젝트를 못 읽으면 던진다(화면이 "없음"과 "읽지 못함"을 다르게, 불변 2). 내 태그만 못 읽으면 tags = null로 두고 나머지는 보인다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import type { StatusProjectRow } from "../dashboard/status-view.ts";
import { readMyTechTagMap } from "./my-tech-tags.ts";

export type StatusData = { projects: StatusProjectRow[]; tags: Map<string, string[]> | null };

export async function readStatusData(db: SupabaseClient, userId: string): Promise<StatusData> {
  const [res, tags] = await Promise.all([
    db.from("projects")
      .select("id, name, kind, my_technologies(id, tech_id, manual_name, hidden_at, read_at, collect_error_kind, grade, technologies(display_name)), runs!runs_project_id_fkey(status, created_at)")
      .eq("owner_id", userId).is("archived_at", null).order("created_at"),
    readMyTechTagMap(db, userId).catch((e: unknown) => { console.error("현황: 내 태그를 읽지 못함", e instanceof Error ? maskSecrets(e.message) : e); return null; }),
  ]);
  if (res.error || !res.data) throw new Error(`내 프로젝트를 읽지 못함: ${maskSecrets(res.error?.message ?? "빈 응답")}`);
  // DB 타입을 생성하기 전이라 다대일(technologies)도 배열로 추론된다. 실제 응답은 한 줄 객체
  return { projects: res.data as unknown as StatusProjectRow[], tags };
}
