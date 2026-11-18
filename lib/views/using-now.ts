// "쓰고 있어요"(PRD-F34, 불변 5 개정·D11): 그 기술을 쓰는 사람 수와 별명. 숨김을 켠 사람(is_public=false)은 이름·수 모두에서 빠진다.
// 서버가 계산해 수와 별명만 내려보낸다(남의 목록 원본은 내려보내지 않음). 순수 함수.
// 지금 RLS(my_technologies는 본인·관리자만)로는 사용자 권한으로 남의 줄을 셀 수 없다 → 화면은 자리만(DB 함수는 P-12 몫).

export type UserTechRow = { ownerId: string; techId: string; hidden: boolean };
export type PublicProfile = { id: string; nickname: string; isPublic: boolean };
export type UsingNow = { count: number; nicknames: string[] };

const MAX_NAMES = 20;

/** 한 기술을 쓰는 공개 사용자 수와 별명(가나다순, 최대 20개). 같은 사람이 여러 프로젝트에서 써도 한 번 */
export function usingNow(techId: string, rows: UserTechRow[], profiles: PublicProfile[]): UsingNow {
  const publicById = new Map(profiles.filter((p) => p.isPublic).map((p) => [p.id, p.nickname]));
  const owners = new Set(rows.filter((r) => r.techId === techId && !r.hidden && publicById.has(r.ownerId)).map((r) => r.ownerId));
  const nicknames = [...owners].map((id) => publicById.get(id)!).sort((a, b) => a.localeCompare(b, "ko")).slice(0, MAX_NAMES);
  return { count: owners.size, nicknames };
}
