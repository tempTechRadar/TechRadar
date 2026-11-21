"use client";
// 사이드 패널 사용기 요약(11-21 사용자 결정 G, PRD-F35): "도움이 됐어요" 많은 순 3개 + 전체 수. 글은 React가 글자 그대로 그린다(HTML로 해석하지 않음).
// 쓴 사람은 보이지 않는다(사용기 화면과 같은 규칙). 사용기는 로그인해야 읽힌다(RLS).
import Link from "next/link";
import { useEffect, useState } from "react";
import type { NoteSummary } from "@/lib/server/usage-notes";
import { usageSummaryAction } from "./actions";

/** all = 사용기를 모두 보고 쓰는 곳(내 기술 상세). 없으면 요약만
 *  shortcut: 카탈로그 상세(/tech/[id])에는 사용기 목록이 없어 내 기술이 아니면 "모두 보기"가 없다. 카탈로그 상세에 사용기를 붙일 때 링크를 연다 */
export function SideNotes({ techId, login, all }: { techId: string | null; login: boolean; all: string | null }) {
  const [got, setGot] = useState<{ id: string; v: NoteSummary | null } | null>(null);
  useEffect(() => {
    if (!login || !techId) return;
    let live = true;
    usageSummaryAction(techId).then((v) => { if (live) setGot({ id: techId, v }); }, () => { if (live) setGot({ id: techId, v: null }); });
    return () => { live = false; };
  }, [techId, login]);
  if (!techId) return <p className="muted">이름만 넣은 기술이라 사용기가 없어요.</p>;
  if (!login) return <p className="muted">로그인하면 써 본 사람의 사용기를 볼 수 있어요.</p>;
  const s = got?.id === techId ? got.v : undefined;
  if (s === undefined) return <p className="muted" role="status">사용기를 읽는 중…</p>;
  if (s === null) return <p className="notice notice-error" role="alert">사용기를 불러오지 못했어요. 없는 게 아니에요.</p>;
  if (!s.total) return <p className="muted">아직 사용기가 없어요.{all ? <> <Link href={all}>첫 사용기 남기기</Link></> : null}</p>;
  return (
    <>
      <ul className="side-notes">{s.top.map((n) => (
        <li key={n.id}>
          <p><b>무엇에 썼나</b> {n.usedFor}</p>
          <p><b>결과</b> {n.result}</p>
          <p><b>팁</b> {n.tip}</p>
          <p className="muted">도움이 됐어요 {n.helpfulCount}</p>
        </li>
      ))}</ul>
      {all ? <Link href={all}>사용기 {s.total}개 모두 보기</Link> : s.total > s.top.length ? <p className="muted">전체 {s.total}개 중 도움이 많이 된 {s.top.length}개예요.</p> : null}
    </>
  );
}
