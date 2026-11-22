"use client";
// 판단 대기 "새로 옴"의 기준 시각을 남긴다(P-12g B5). 서버가 알림을 읽기 직전에 잡은 시각(value)을 이 화면을 떠날 때(다른 화면으로 · 탭 닫기) 쿠키로 쓴다:
// 열자마자 쓰면 같은 방문 안의 거르기 · 새로 고침에서 "새로 옴"이 보자마자 사라지고, 서버 액션으로 쓰면 다시 그려져 바로 사라진다.
// 기준은 앞으로만 간다(뒤로 가기로 옛 화면이 다시 붙거나 탭이 둘이어도 이미 본 알림이 다시 "새로 옴"이 되지 않게, 불변 3).
// 알림 읽기에 성공한 화면(개요 · 일지)만 이 조각을 그린다(소식 탭 · 미리보기 · 실패는 안 그림)
import { useEffect } from "react";
import { parseSeen, SEEN_COOKIE } from "@/lib/dashboard/since-last-visit";

const HALF_YEAR = 60 * 60 * 24 * 180;
const current = () => document.cookie.split("; ").find((c) => c.startsWith(`${SEEN_COOKIE}=`))?.slice(SEEN_COOKIE.length + 1);

export function SeenMarker({ value }: { value: string }) {
  useEffect(() => {
    const who = value.split("|")[0];
    const write = () => {
      const at = parseSeen(value, who, new Date(8.64e15)), had = parseSeen(current(), who, new Date(8.64e15));
      if (at === null || (had !== null && had >= at)) return;
      document.cookie = `${SEEN_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${HALF_YEAR}; samesite=lax`;
    };
    addEventListener("pagehide", write);
    return () => { removeEventListener("pagehide", write); write(); };
  }, [value]);
  return null;
}
