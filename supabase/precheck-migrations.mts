// `npm run precheck` 끝에서 부른다: 이 브랜치가 더하거나 고친 마이그레이션이 있으면 "합치기 전에 운영에 먼저" 규칙을 알린다.
// 운영 DB에 적용됐는지는 여기서 알 수 없어(키 없이 읽기만) 막지 않고 경고만 한다. CLAUDE.md 10절, 2026-11-19 #133 장애.
import { execFileSync } from "node:child_process";

const changed = execFileSync(
  "git",
  ["diff", "--name-only", "--diff-filter=AM", "origin/main...HEAD", "--", "supabase/migrations/*.sql"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

if (changed.length > 0) {
  console.log(`\n⚠️  이 브랜치에 마이그레이션 ${changed.length}개가 있어요:`);
  for (const file of changed) console.log(`   - ${file}`);
  console.log("   합치기 전에 운영 DB에 먼저 적용하고(김영식 리뷰·승인 뒤) PR 설명에 \"운영 적용: 완료(시각)\"를 쓰세요.");
  console.log("   코드는 새 칸이 없어도 깨지지 않게(#135 방식). 합친 뒤에는 docs/운영-점검표.md를 도세요.\n");
}
