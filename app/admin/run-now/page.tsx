// 관리자 "지금 한 번 실행"(P-17, IA-15 일부). 등록된 수집기, 3번 연속 수집 오류 출처 강조, 실행 버튼. 관리자만(불변 5).
// 페이지는 역할 확인 · 읽기만, 그림은 body.tsx(I-admin-unify). 실행이 끝나면 서버 동작이 그 실행 id로 흐름 화면에 보낸다(actions.ts).
import { redirect } from "next/navigation";
import { SCHEDULE_COLLECTORS } from "@/lib/schedule/collectors";
import { readSourceHistory } from "@/lib/schedule/history";
import { sourcesToHighlight } from "@/lib/schedule/retry";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "../admin-shell";
import { readFlash } from "@/lib/server/admin-flash";
import { RunNowBody, TITLE, type LastRun } from "./body";

// "지금 한 번 실행"이 수집기를 직접 돈다(묶음 예산 240초, P-9). 서버 액션은 이 화면의 시간 한도를 따르므로 cron 경로와 같이 Hobby 최대로 둔다.
export const maxDuration = 300;

export default async function RunNowPage({ searchParams }: { searchParams: Promise<{ error?: string; info?: string; sig?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <AdminShell tab="run-now" title={TITLE} blocked="forbidden" />;
  const { error: errorParam, info: infoParam, sig } = await searchParams;
  const error = readFlash("error", errorParam, sig);
  const info = readFlash("info", infoParam, sig);
  const sources = SCHEDULE_COLLECTORS.map((c) => c.source);
  const db = await getServerSupabase();
  let highlight: string[] = [];
  let readError: string | null = null;
  let last: LastRun | null | undefined;
  try {
    highlight = db ? sourcesToHighlight(await readSourceHistory(db, sources)) : [];
    if (db) {
      const res = await db.from("runs").select("id, status, created_at").eq("trigger", "manual").order("created_at", { ascending: false }).limit(1);
      if (res.error) throw new Error(res.error.message);
      last = (res.data?.[0] as LastRun | undefined) ?? null;
    }
  } catch (e) {
    readError = e instanceof Error ? e.message : String(e);
  }
  return <RunNowBody sources={sources} highlight={highlight} last={last} readError={readError} error={error} info={info} />;
}
