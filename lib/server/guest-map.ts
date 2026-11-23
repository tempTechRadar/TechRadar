// 로그인 전 지도 목록(공개 칸만) 캐시: 누구에게나 같아 10분 동안 한 번만 읽는다(요청이 몰려도 DB는 그대로, ADR 0029). 실패는 기억하지 않는다(던지면 캐시 안 됨).
// 키에 공개 칸을 넣어 칸이 바뀐 배포는 옛 캐시를 쓰지 않는다. shortcut: 관리자가 상태·갈래를 고쳐도 최대 10분 늦게 보인다, 바로 보여야 하면 태그로 비운다.
// 지도(app/page.tsx)와 청사진 서랍 "지도 전체"(P-12o)가 같은 캐시를 쓴다
import { unstable_cache } from "next/cache";
import { CATALOG_LIMIT, NEW_RULE_VERSION, PICK_RULE, readGuestMapInput, TECH_COLUMNS } from "./map-queries.ts";
import { getServiceSupabase } from "./service-supabase.ts";

export const readGuestMap = unstable_cache(async () => {
  const db = getServiceSupabase();
  if (!db) throw new Error("서비스 키 설정이 없음");
  return readGuestMapInput(db);
}, ["guest-map", TECH_COLUMNS, NEW_RULE_VERSION, String(CATALOG_LIMIT), PICK_RULE], { revalidate: 600 }); // 올리는 수가 바뀐 배포는 옛 캐시를 안 씀
