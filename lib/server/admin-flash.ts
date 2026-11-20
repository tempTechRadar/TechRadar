// 관리자 화면의 "방금 한 일" 안내를 주소(?error=·?info=)에 실어 보낼 때 서명을 붙이고, 화면은 서명이 맞는 글만 보인다.
// 서버 동작만 서명할 수 있으므로 남이 만든 링크가 관리자 화면에 가짜 안내를 띄울 수 없다. 상대 경로 import: node --test가 `@/`를 못 읽는다.
import { createHmac, timingSafeEqual } from "node:crypto";
import { readServiceRoleKey } from "../env.ts";

// shortcut: 서비스 키가 없는 환경(개발)에서는 공개 상수로 서명한다 — 그때는 가짜 안내를 막지 못한다. 키가 없으면 어차피 이 화면이 하는 일이 없다.
const secretOf = (): string => readServiceRoleKey(process.env) ?? "admin-flash-without-service-key";

export const signFlash = (secret: string, key: string, text: string): string => createHmac("sha256", secret).update(`${key}\n${text}`).digest("base64url");

export function verifyFlash(secret: string, key: string, text: unknown, sig: unknown): boolean {
  if (typeof text !== "string" || typeof sig !== "string") return false;
  const want = Buffer.from(signFlash(secret, key, text));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** `error=글&sig=서명` 형태의 주소 조각. redirect(`${PAGE}?${flashQuery(...)}`)처럼 쓴다. */
export const flashQuery = (key: string, text: string, secret: string = secretOf()): string =>
  `${key}=${encodeURIComponent(text)}&sig=${signFlash(secret, key, text)}`;

/** 주소에서 온 글은 서명이 맞을 때만 돌려준다(아니면 undefined = 보이지 않음). */
export const readFlash = (key: string, text: unknown, sig: unknown, secret: string = secretOf()): string | undefined =>
  typeof text === "string" && text && verifyFlash(secret, key, text, sig) ? text : undefined;
