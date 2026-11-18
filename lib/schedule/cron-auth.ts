// 예약 엔드포인트 보호: Vercel은 환경변수 CRON_SECRET 값을 `Authorization: Bearer <값>`으로 보낸다(2026-11 공식 문서).
// 값은 코드·문서에 쓰지 않고 환경변수 이름만 쓴다. 비교는 걸린 시간으로 값을 짐작하지 못하게 고정 시간으로.
import { timingSafeEqual } from "node:crypto";

export function cronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false; // 비밀값을 안 넣었으면 누구도 못 부른다
  const given = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
