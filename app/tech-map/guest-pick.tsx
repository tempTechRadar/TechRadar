"use client";
// 지도 사이드 패널의 손님용 "청사진에 담기"(P-12h-2 T3): 이 브라우저 담은 목록(lib/blueprint/picked)에 id만 넣는다. 서버에 아무것도 저장하지 않는다.
// 로그인한 사람은 쓰지 않는다(적용 후보가 청사진 관문, side-panel ToBlueprint).
import Link from "next/link";
import { useEffect, useState } from "react";
import { addPicked, loadPicked, PICKED_MAX, removePicked, savePicked } from "@/lib/blueprint/picked";

export function GuestPick({ techId }: { techId: string }) {
  const [list, setList] = useState<string[] | null>(null); // 서버 그림과 같게 비운 채 그린 뒤 이 브라우저 목록을 읽는다
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => { setList(loadPicked()); setSaid(null); }, [techId]);
  const keep = (next: string[], ok: string) => { if (savePicked(next)) { setList(next); setSaid(ok); } else setSaid("이 브라우저에 저장하지 못했어요(저장이 막힌 브라우저). 청사진에서 직접 고를 수 없어요."); };
  const pick = () => {
    const r = addPicked(loadPicked(), techId); // 다른 탭에서 바뀌었을 수 있어 다시 읽고 더한다
    if (r.result === "full") return setSaid(`담은 기술은 ${PICKED_MAX}개까지예요. 청사진에서 몇 개 빼 주세요.`);
    if (r.result === "bad") return;
    keep(r.list, "청사진에 담았어요.");
  };
  const has = Boolean(list?.includes(techId));
  return (
    <div className="side-to-bp">
      {has ? <p role="status">{said ?? "청사진에 담겨 있어요."} <Link href="/blueprint">청사진 열기</Link> · <button type="button" className="link" onClick={() => keep(removePicked(loadPicked(), techId), "담은 목록에서 뺐어요.")}>빼기</button></p>
        : <>
          <button type="button" className="btn btn-primary" onClick={pick}>청사진에 담기</button>
          {said ? <p role="status">{said}</p> : null}
        </>}
      <p className="muted">로그인 전에는 이 브라우저에만 담겨요. 설치는 Claude Code에서 직접 해요.</p>
    </div>
  );
}
