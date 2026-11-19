#!/usr/bin/env bash
# production 배포를 부를지 정한다(ADR 0023). 결과를 GitHub Actions 출력 형식(deploy=true|false)으로 낸다. 이유는 표준 오류로.
# LIVE_SHA: 운영 주소 /api/version이 알려 준, 지금 올라가 있는 커밋. 비었거나 이 저장소에 없으면 배포한다(모르면 배포 쪽으로).
# FORCE=true면 무조건 배포한다(수동 실행).
# 운영 커밋 뒤로 앱에 영향을 주는 파일이 바뀌었을 때만 배포한다. 제외 목록은 ADR 0018 개정의 ignoreCommand와 같고 .github/만 더했다
# (wiki/·sim/·eval/·slides/는 앱이 읽어서 일부러 넣지 않는다. *.md는 루트 것만).
set -euo pipefail

say() { echo "$1" >&2; }

if [ "${FORCE:-false}" = "true" ]; then
  say "수동 실행: 바로 배포해요"
  echo "deploy=true"
  exit 0
fi

if [ -z "${LIVE_SHA:-}" ] || ! git cat-file -e "${LIVE_SHA}^{commit}" 2>/dev/null; then
  say "운영 커밋을 몰라요(${LIVE_SHA:-없음}): 배포해요"
  echo "deploy=true"
  exit 0
fi

APP=(. ':(exclude)docs' ':(exclude)interviews' ':(exclude)rules' ':(exclude).claude' ':(exclude).github' ':(exclude,glob)*.md')
if git diff --quiet "$LIVE_SHA" HEAD -- "${APP[@]}"; then
  say "운영(${LIVE_SHA:0:7}) 뒤로 문서만 바뀌었어요: 배포하지 않아요"
  echo "deploy=false"
else
  say "운영(${LIVE_SHA:0:7}) 뒤로 바뀐 앱 파일:"
  git diff --stat "$LIVE_SHA" HEAD -- "${APP[@]}" >&2
  echo "deploy=true"
fi
