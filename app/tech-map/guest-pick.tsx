"use client";
// 지도 사이드 패널의 손님용 "청사진에 담기"(P-12h-2 T3): 이 브라우저 담은 목록(lib/blueprint/picked)에 id만 넣는다. 서버에 아무것도 저장하지 않는다.
// 로그인한 사람은 쓰지 않는다(적용 후보 = 담기, side-panel Cart). 담긴 뒤 줄은 로그인과 같은 자리 · 같은 말(CartIn, P-12h U1).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addPicked, loadPicked, PICKED_MAX, removePicked, savePicked } from "@/lib/blueprint/picked";
import { cartChanged } from "@/lib/blueprint/cart-event";

/** 담긴 뒤 줄: 로그인(side-panel Cart)과 손님이 같은 자리 · 같은 말 */
export const CartIn = ({ busy, onOut }: { busy?: boolean; onOut: () => void }) => (
  <p className="side-cart-in">담김 ✓ · <button type="button" className="link" disabled={busy} onClick={onOut}>빼기</button> · <Link href="/blueprint">청사진 열기</Link></p>
);

/** 담기 · 빼기로 누른 단추가 다른 단추로 바뀌면 초점이 body로 떨어진다 → 이 칸 안에서 누른 뒤 초점을 잃었을 때만 칸의 첫 단추(빼기 · 담기)로 */
export function useCartFocus(key: string) {
  const box = useRef<HTMLDivElement>(null), asked = useRef(false);
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (!asked.current || !lost) return;
    const b = box.current?.querySelector("button");
    b?.focus();
    if (b && document.activeElement === b) asked.current = false; // 꺼진 단추면 못 받음: 켜질 때(다음 key) 다시
  }, [key]);
  return { ref: box, onClickCapture: () => { asked.current = true; } };
}

export function GuestPick({ techId }: { techId: string }) {
  const [list, setList] = useState<string[] | null>(null); // 서버 그림과 같게 비운 채 그린 뒤 이 브라우저 목록을 읽는다
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => { setList(loadPicked()); setSaid(null); }, [techId]);
  const keep = (next: string[], ok: string) => { if (savePicked(next)) { setList(next); setSaid(ok); cartChanged(); } else setSaid("이 브라우저에 저장하지 못했어요(저장이 막힌 브라우저). 청사진에서 직접 고를 수 없어요."); };
  const pick = () => {
    const r = addPicked(loadPicked(), techId); // 다른 탭에서 바뀌었을 수 있어 다시 읽고 더한다
    if (r.result === "full") return setSaid(`담은 기술은 ${PICKED_MAX}개까지예요. 청사진에서 몇 개 빼 주세요.`);
    if (r.result === "bad") return;
    keep(r.list, "청사진에 담았어요.");
  };
  const has = Boolean(list?.includes(techId));
  const focus = useCartFocus(`${has}:${said}`);
  return (
    <div className="side-to-bp" {...focus}>
      {has ? <CartIn onOut={() => keep(removePicked(loadPicked(), techId), "청사진에서 뺐어요.")} />
        : <button type="button" className="btn btn-primary" onClick={pick}>청사진에 담기</button>}
      <p role="status">{said}</p>
      <p className="muted">로그인 전에는 이 브라우저에만 담겨요. 설치는 Claude Code에서 직접 해요.</p>
    </div>
  );
}
