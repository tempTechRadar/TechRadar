"use client";
// 판단 대기 "새로 옴"의 기준 시각을 남긴다(P-12g B5). 서버가 알림을 읽기 직전에 잡은 시각(value)을 화면이 그려진 뒤 쿠키로 쓴다:
// 서버 액션으로 쓰면 화면이 다시 그려져 "새로 옴"이 보자마자 사라진다. 알림 읽기에 성공한 화면(개요 · 일지)만 이 조각을 그린다(소식 탭 · 미리보기 · 실패는 안 그림)
import { useEffect } from "react";
import { SEEN_COOKIE } from "@/lib/dashboard/since-last-visit";

const HALF_YEAR = 60 * 60 * 24 * 180;

export function SeenMarker({ value }: { value: string }) {
  useEffect(() => { document.cookie = `${SEEN_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${HALF_YEAR}; samesite=lax`; }, [value]);
  return null;
}
