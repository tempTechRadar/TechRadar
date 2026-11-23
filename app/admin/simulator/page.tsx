// 시뮬레이터 화면(IA-16 아래). 버튼 한 번으로 가짜 변경 1건을 만들고, 가짜 표시 줄만 지운다. 관리자만(불변 5).
// 11-23 리뉴얼: 관리자 틀(AdminShell) 안으로. 역할 검사 · 서버 액션 · 문구 뜻은 그대로.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/current-user";
import { AdminShell } from "../admin-shell";
import { readFlash } from "@/lib/server/admin-flash";
import { SimulatorBody, TITLE } from "./body";

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ error?: string; cleared?: string; info?: string; run?: string; sig?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <AdminShell tab="simulator" title={TITLE} blocked="forbidden" />;
  const { error: errorParam, cleared: clearedParam, info: infoParam, run, sig } = await searchParams;
  return <SimulatorBody error={readFlash("error", errorParam, sig)} cleared={readFlash("cleared", clearedParam, sig)} info={readFlash("info", infoParam, sig)} run={run} />;
}
