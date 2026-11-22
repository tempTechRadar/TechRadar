// `npm run precheck` 끝에서 부른다. 두 가지를 본다.
// ① 마이그레이션 번호(앞 12자리)가 origin/main과 이 브랜치의 서로 다른 파일끼리 겹치면 **실패**한다(이번 주 두 번 남, lib/records/migration-numbers.ts).
// ② 이 브랜치가 더하거나 고친 마이그레이션이 있으면 "합치기 전에 운영에 먼저" 규칙을 알린다. 운영 DB에 적용됐는지는 여기서 알 수 없어(키 없이 읽기만) 막지 않고 경고만 한다. CLAUDE.md 10절, 2026-11-19 #133 장애.
import { execFileSync } from "node:child_process";
import { duplicateMigrationNumbers } from "../lib/records/migration-numbers.ts";

const namesAt = (ref: string): string[] =>
  execFileSync("git", ["ls-tree", "--name-only", ref, "supabase/migrations/"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((path) => path.split("/").pop()!);

const duplicates = duplicateMigrationNumbers([...namesAt("origin/main"), ...namesAt("HEAD")]);
if (duplicates.length > 0) {
  console.error("\n❌ 마이그레이션 번호(파일 이름 앞 12자리)가 겹쳐요:");
  for (const d of duplicates) console.error(`   ${d.number}: ${d.files.join(" ↔ ")}`);
  console.error("   한쪽 파일 이름의 번호를 다른 번호로 바꾸세요(이미 운영에 적용한 파일은 바꾸지 말고 아직 안 적용한 쪽을 바꿉니다). 바꾼 뒤 docs/debug-note.md · PR 설명에 알립니다.\n");
  process.exit(1);
}

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
