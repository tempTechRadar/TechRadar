// 실패 시연 화면(P-20c, docs/flow.md 4절, PRD-F28·F29·F30). 관리자만(불변 5). ①②⑤는 시연 스위치가 켜졌을 때만.
// 페이지는 역할 확인 · 스위치 읽기만, 그림은 body.tsx(I-admin-unify). 버튼은 실제 경로를 타고, 흐름 화면은 그 기록으로만 칠한다(불변 6).
import { redirect } from "next/navigation";
import { isDemoSwitchEnabled } from "@/lib/demo/demo-switch";
import { getCurrentUser } from "@/lib/server/current-user";
import { AdminShell } from "../admin-shell";
import { readFlash } from "@/lib/server/admin-flash";
import { DemoBody, TITLE } from "./body";

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ error?: string; info?: string; sig?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <AdminShell tab="demo" title={TITLE} blocked="forbidden" />;
  const { error: errorParam, info: infoParam, sig } = await searchParams;
  return <DemoBody on={isDemoSwitchEnabled(process.env)} error={readFlash("error", errorParam, sig)} info={readFlash("info", infoParam, sig)} />;
}
