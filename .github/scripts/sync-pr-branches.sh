#!/usr/bin/env bash
# 열린 PR 브랜치마다 origin/main을 합쳐 푸시한다(ADR 0017 개정). 강제 푸시는 하지 않는다.
# 표준 입력: "PR번호 브랜치이름" 한 줄씩. DRY_RUN=true면 합쳐만 보고 푸시하지 않는다.
set -u
export MSYS_NO_PATHCONV=1 # 윈도우 Git Bash가 `origin/main:파일`을 경로로 바꾸는 것을 막는다(리눅스에서는 무해)

dry_run="${DRY_RUN:-false}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
ok=0; same=0; skipped=0; conflict=0; failed=0

git fetch origin main --quiet || { echo "main을 받지 못함" >&2; exit 1; }
# 옛 브랜치는 .gitattributes가 없어 union이 안 걸리므로, main의 설정을 이 저장소 전용 설정(info/attributes)으로 쓴다.
attr="$(git rev-parse --git-path info/attributes)"
mkdir -p "$(dirname "$attr")"
git show origin/main:.gitattributes > "$attr" || { echo "main의 .gitattributes를 읽지 못함" >&2; exit 1; }

report() { # 번호 브랜치 결과
  echo "#$1 $2: $3"
  echo "| #$1 | \`$2\` | $3 |" >> "$summary"
}
{ echo "### 열린 PR에 main 합치기 (DRY_RUN=$dry_run)"; echo; echo "| PR | 브랜치 | 결과 |"; echo "|---|---|---|"; } >> "$summary"

while read -r number branch; do
  [ -n "${branch:-}" ] || continue
  case "$branch" in
    feat/*|fix/*|docs/*|chore/*) ;;
    *) report "$number" "$branch" "건드리지 않음: 미리보기 배포가 꺼진 이름(feat·fix·docs·chore)이 아님, ADR 0018"; skipped=$((skipped + 1)); continue ;;
  esac
  if ! git fetch origin "+refs/heads/$branch:refs/remotes/origin/$branch" --quiet || ! git checkout -q --detach "origin/$branch"; then
    report "$number" "$branch" "브랜치를 받지 못함(지워졌을 수 있음)"; failed=$((failed + 1)); continue
  fi
  if git merge-base --is-ancestor origin/main HEAD; then
    report "$number" "$branch" "이미 최신"; same=$((same + 1))
  elif git merge -q -m "Merge origin/main into $branch (자동 합치기)" origin/main > /dev/null 2>&1; then
    if [ "$dry_run" = "true" ]; then
      report "$number" "$branch" "합쳐짐(시험이라 푸시 안 함)"; ok=$((ok + 1))
    elif git push -q origin "HEAD:refs/heads/$branch" 2> /dev/null; then
      report "$number" "$branch" "합쳐서 푸시함"; ok=$((ok + 1))
    else
      report "$number" "$branch" "푸시 거절: 그새 새 커밋이 올라왔거나 워크플로 파일 권한 문제. 작성자가 git pull 필요"; failed=$((failed + 1))
    fi
  else
    files="$(git diff --name-only --diff-filter=U | tr '\n' ' ')"
    git merge --abort 2> /dev/null || true
    report "$number" "$branch" "자동으로 못 합침, 사람이 풀어야 함(충돌 파일: ${files:-확인 못 함})"; conflict=$((conflict + 1))
  fi
done

line="합침 $ok · 이미 최신 $same · 건너뜀 $skipped · 충돌 $conflict · 실패 $failed"
echo "$line"
echo >> "$summary"; echo "$line" >> "$summary"
