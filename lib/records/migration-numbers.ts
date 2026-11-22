// 마이그레이션 파일 이름 앞 12자리 번호(YYYYMMDDHHMM)가 서로 다른 파일끼리 겹치는지 본다. 순수 함수.
// 이번 주에 두 번 났다(11-21 202611211200 starter_set ↔ P-21a, 11-22 202611221300 blueprint_checks ↔ public_gallery_anon): 번호는 적용 순서이자 "어느 파일이 어느 것인가"라서,
// 겹치면 먼저 적용할 것이 모호해지고 합칠 때 한쪽을 몰래 바꾸게 된다. `npm run precheck`(supabase/precheck-migrations.mts)가 origin/main과 이 브랜치 파일을 합쳐 이 함수로 본다.

/** 규칙이 생기기 전에 이미 운영에 둘 다 적용된 겹침(11-19): 번호가 아니라 이 파일 이름들만 허용한다(같은 번호의 다른 파일이 더 생기면 잡힌다) */
export const LEGACY_DUPLICATES: ReadonlySet<string> = new Set(["202611191700_P-12a2_nickname_using_now.sql", "202611191700_P-14_seed_same_role.sql"]);

const NUMBER = /^(\d{12})_/;

export type Duplicate = { number: string; files: string[] };

/** 파일 이름 목록(경로 없이)에서 같은 번호를 가진 서로 다른 파일. 같은 이름이 두 번 들어와도(origin/main과 이 브랜치에 같은 파일) 겹침이 아니고, 허용 목록의 파일끼리만 겹친 것은 뺀다 */
export function duplicateMigrationNumbers(names: string[], legacy: ReadonlySet<string> = LEGACY_DUPLICATES): Duplicate[] {
  const byNumber = new Map<string, Set<string>>();
  for (const name of names) {
    const number = NUMBER.exec(name)?.[1];
    if (number) byNumber.set(number, (byNumber.get(number) ?? new Set()).add(name));
  }
  return [...byNumber]
    .filter(([, files]) => files.size > 1 && ![...files].every((f) => legacy.has(f)))
    .map(([number, files]) => ({ number, files: [...files].sort() }))
    .sort((a, b) => (a.number < b.number ? -1 : 1));
}
