// 분류 확인(IA-17, PRD-F24·F27, ADR 0015): 갈래가 없는 기술, 이름만 써서 직접 추가한 기술, 같은 역할 후보, 규칙 목록(rule_lists).
// 같은 역할 확정·규칙 켜기·끄기·추가(P-18b)와 갈래 정하기·고치기(P-18c)는 사유를 받아 담당자·시각·사유를 남긴다(audit_logs). 관리자만.
// 페이지는 관리자 확인 · 읽기만, 그림은 body.tsx(I-admin-unify).
import { readClassify } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { readFlash } from "@/lib/server/admin-flash";
import { AdminShell } from "../admin-shell";
import { ClassifyBody, TITLE, type ClassifyData } from "./body";

export const maxDuration = 60; // "규칙으로 한 번에 분류"가 한 번에 40초까지 돈다(P-12f ⑧)

type Search = { error?: string; info?: string; sig?: string };

export default async function ClassifyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="classify" title={TITLE} blocked={gate.blocked} />;
  const { error: errorParam, info: infoParam, sig } = await searchParams;
  const actionError = readFlash("error", errorParam, sig);
  const info = readFlash("info", infoParam, sig);
  let data: ClassifyData | null = null;
  let error: string | null = null;
  try { data = await readClassify(gate.db); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  return <ClassifyBody data={data} meId={gate.user.id} error={error} actionError={actionError} info={info} />;
}
