"use client";
// 청사진 담기 부품(P-12h U1): 관심 별(Star) · 로그인 담기(Cart = 적용 후보 저장) · 손님 담기(GuestPick, P-12h-2 T3: 이 브라우저 담은 목록에 id만, 서버 저장 없음).
// 지도 사이드 패널과 기술 상세(P-12h-detail-marks)가 같이 쓴다. 담긴 뒤 줄은 로그인 · 손님이 같은 자리 · 같은 말(CartIn).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addPicked, loadPicked, PICKED_MAX, removePicked, savePicked } from "@/lib/blueprint/picked";
import { cartChanged } from "@/lib/blueprint/cart-event";
import type { Mark, MarkStatus } from "@/lib/map/build-map";
import "./cart.css";

/** text = 저장 뒤 토스트 글(담기 · 빼기 · 별은 판단 이름 대신 하는 일로 말한다) */
export type OnCartMark = (status: MarkStatus | null, text: string) => void;

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

/** 관심 별: 담은 기술(적용 후보)도 관심이 들어 있는 것으로 채워 보인다. 끄면 표시를 지운다(담은 것도 빠짐 → 토스트가 말함) */
export function Star({ status: s, busy, onMark }: { status: MarkStatus | undefined; busy: boolean; onMark: OnCartMark }) {
  const on = s === "interest" || s === "candidate";
  const off = s === "candidate" ? "관심을 풀고 청사진에서도 뺐어요." : "관심을 풀었어요.";
  return <button type="button" className="side-star" aria-label="관심 표시" aria-pressed={on} disabled={busy} onClick={() => onMark(on ? null : "interest", on ? off : "관심으로 남겼어요.")}>{on ? "★" : "☆"}</button>;
}

/** 청사진 장바구니(11-22 사용자): 담기 = 적용 후보 저장(DB 그대로), 단추는 늘 켜 둔다. 위험 등급은 누르면 이유만(DB도 막음).
 *  빼기 = 관심으로 낮춤(별은 남김). 다시 담기는 그 사이 온 알림까지 판단할 수 있어 토스트 되돌리기가 없다(canUndoMark, 불변 1) */
export function Cart({ techId, mark, danger, login, busy, onMark }: { techId: string | null; mark: Mark | null; danger: boolean; login: boolean; busy: boolean; onMark: OnCartMark }) {
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => setWhy(null), [techId]);
  const focus = useCartFocus(`${mark?.status}:${busy}`); // 저장 중 단추가 꺼져도 초점이 떨어진다: 끝나면(실패 포함) 되돌림
  if (!techId) return <p className="muted side-to-bp">이름만 넣은 기술이라 청사진에 담을 수 없어요.</p>;
  if (!login) return <GuestPick techId={techId} />; // 손님(P-12h-2 T3): 이 브라우저 담은 목록 → 청사진 "지도에서 담은 기술"
  const s = mark?.status;
  const put = () => (danger ? setWhy(DANGER_CART) : onMark("candidate", "청사진에 담았어요."));
  return (
    <div className="side-to-bp" {...focus}>
      {s === "candidate" ? <CartIn busy={busy} onOut={() => onMark("interest", "청사진에서 뺐어요. 관심은 남겨 뒀어요.")} />
        : <button type="button" className="btn btn-primary" disabled={busy} onClick={put}>청사진에 담기</button>}
      <p role="status">{why}</p>
      {s === "hold" ? <p className="muted">지금 보류예요{mark?.reason ? `(${mark.reason})` : ""}. 담거나 별을 누르면 보류가 풀려요.</p> : null}
      <p className="muted">{s === "candidate" ? "" : "담으면 '적용 후보'로 남고, 이 기술의 판단 대기 알림도 함께 판단돼요. "}설치는 Claude Code에서 직접 해요.</p>
    </div>
  );
}
const DANGER_CART = "보안 위험 등급이라 바로 담을 수 없어요. 보안 경고 알림에서 고친 버전과 함께 판단해 주세요.";
