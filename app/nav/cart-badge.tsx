"use client";
// 메뉴 "청사진" 옆 담은 수(P-12h U1): 로그인 = 적용 후보 수(서버), 손님 = 이 브라우저에 담은 수. 못 읽으면(null) 배지를 숨긴다(0으로 단정하지 않음, 불변 2).
// 지도에서 담기 · 빼기가 CART_EVENT를 보내면 다시 센다(더하고 빼지 않고 늘 처음부터 세서 두 번 세지 않게).
import { useEffect, useState } from "react";
import { loadPicked } from "@/lib/blueprint/picked";
import { CART_EVENT } from "@/lib/blueprint/cart-event";
import { cartCount } from "./cart-count";

export function CartBadge({ initial, login }: { initial: number | null; login: boolean }) {
  const [n, setN] = useState(initial);
  useEffect(() => {
    const recount = () => { if (login) cartCount().then(setN, () => setN(null)); else setN(loadPicked().length); };
    if (login) setN(initial); else recount();
    window.addEventListener(CART_EVENT, recount);
    if (!login) window.addEventListener("storage", recount); // 다른 탭에서 담음
    return () => { window.removeEventListener(CART_EVENT, recount); window.removeEventListener("storage", recount); };
  }, [initial, login]);
  return n ? <span className="nav-badge"><span aria-hidden="true">{n > 99 ? "99+" : n}</span><span className="sr-only">, 담은 기술 {n}개</span></span> : null;
}
