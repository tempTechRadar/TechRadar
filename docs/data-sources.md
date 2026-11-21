# 데이터 출처 (v1 출처 정함, 2026-11-17)

상태: **v1 출처를 골랐다(2026-11-17, ADR 0008):** 1순위 OSV, 공식 MCP 레지스트리, GitHub 저장소 정보(서버 토큰), npm·PyPI 다운로드 수(`api.npmjs.org/downloads/point/last-week/<패키지>`, `pypistats.org/api/packages/<패키지>/recent`, 2026-11-17 키 없이 호출 확인) / 3순위 Hugging Face Hub, Hacker News, Firecrawl로 skills.sh 인기 페이지 1곳(스킬 설치 수. robots.txt: 공개 페이지 허용, `/api/`·`/search`만 막음, 2026-11-17 확인. 약관(2026-11-21, [terms](https://skills.sh/terms)): 공개 API는 IP별 한도·캐시 권장이고, API는 Vercel OIDC 토큰 인증(분당 600번)을 요구한다. robots.txt는 여전히 `/api/`를 막으므로 **API로 읽으려면 skills.sh 쪽 확인이 먼저**, 공개 HTML 페이지 읽기는 허용 범위. v1은 skills.sh를 읽지 않음). 간격·한도·실패 처리는 spec에서 출처마다 적는다. 아래는 조사한 후보 목록 전체다.

> **v1에서 실제로 읽는 출처의 간격·한도·실패 처리는 아래 "0. v1 실제 사용"에 있다**(코드 기준, 2026-11-20). 그 아래 1~5절은 조사한 후보 전체이고 그대로 둔다.

## 0. v1 실제 사용 (정기 실행이 부르는 수집기 4개, 코드 기준 2026-11-20)
정기 실행(`vercel.json` `0 21 * * *` = 한국 06:00, Hobby라 06:00~06:59 사이)과 관리자 "지금 한 번 실행"이 같은 수집기를 순서대로 돈다(`lib/schedule/collectors.ts`). 묶음 전체 시간 예산은 240초(`run-batch.ts` `DEFAULT_BUDGET_MS`)다. 요청 사이 간격은 모두 1초 이상(SPEC-8).

| 순서 | 출처 | 실제 요청 | 간격·몫 | 실패 처리(불변 2: 못 읽은 것을 "없음"·"변화 없음"으로 단정하지 않음) | 키·약관 |
|---|---|---|---|---|---|
| 1 | OSV (보안 확인, `collect-osv.ts`) | `POST api.osv.dev/v1/query`(이름·생태계·버전). 결과가 쪽으로 나뉘면 `next_page_token`을 `page_token`으로 이어 받음(최대 10쪽, 쪽 사이 1초, `I-P-3-osv-next-page`) | 기술 사이 1초, 묶음 예산 중 150초 | 404·모양이 다른 응답·본문 읽다 끊김·같은 표시 되풀이·10쪽 초과는 그 기술만 수집 오류(`http_status`·`parse`·`timeout`·`network`), 등급 그대로·알림 없음. 한도 초과(429)가 오면 이번 실행에서 더 부르지 않음 | 키 불필요. 요청 횟수 제한 없음(FAQ 2026-11-18 확인) |
| 2 | GitHub 저장소 정보 (`collect-github.ts`) | 저장소마다 REST 1번(`api.github.com/repos/<owner>/<repo>`, 서버 토큰) | 저장소 사이 1초, 몫 60초(한 실행에 60곳 안팎). 넘치는 것은 오래 안 읽은 순서로 다음 실행 | 서버 환경변수 `GITHUB_TOKEN`이 없거나 모양이 이상하면 호출하지 않고 수집 오류. 404는 "찾을 수 없음"(없거나 비공개), 한도 초과·연결·모양은 수집 오류 | **서버 토큰 필요**(ADR 0008 4번, 값은 환경변수에만). 약관 확인(2026-11-21): 이용약관 H절 API Terms는 "지나치게 잦은 요청"과 토큰을 나눠 한도를 넘기는 것만 막음, 허용 정책 7절 "API로 모으는 것은 스크래핑이 아니다". 토큰 한도 시간당 5,000번이라 하루 60곳 안팎은 한참 아래. 403·429면 `retry-after`를 따르라는 안내([약관](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service), [허용 정책](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies), [한도](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)) |
| 3 | 공식 MCP 레지스트리 (`collect-registry.ts`) | `registry.modelcontextprotocol.io/v0.1/servers?limit=100&version=latest&updated_since=<지난번-5분>&cursor=` | 쪽 사이 1초, 몫 60초. 안전장치 500쪽 | 몫을 넘기면 지금까지 읽은 곳까지 저장하고 다음 실행에서 이어 읽음. 500쪽을 읽어도 안 끝나면 `parse` 수집 오류. 못 읽은 쪽을 "서버 없음"으로 보지 않음 | 키 불필요. preview 단계(초기화될 수 있음)라 처음 전체 읽기를 다시 할 수 있음. 약관(2026-11-21): 약관 페이지는 찾지 못함, 숫자 한도도 확인하지 못함. 모으는 쪽 안내는 "자주 말고 정기적으로(예: 1시간에 1번)", 처음 전체 → `updated_since`로 이어 받기, 실패·한도면 물러났다 다시 — 우리 방식(하루 1번, `updated_since`)과 맞음([저장소](https://github.com/modelcontextprotocol/registry), [모으는 쪽 안내](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/registry-aggregators.mdx)) |
| 4 | npm·PyPI 다운로드 수 (`collect-downloads.ts`) | npm `api.npmjs.org/downloads/point/last-week/<패키지>`, PyPI `pypistats.org/api/packages/<패키지>/recent` | 기술 사이 1초, 묶음 마감까지 | 404·모양 오류는 그 기술만 수집 오류(`http_status`·`parse`), 0으로 쓰지 않음. 마감이 오면 남은 기술은 다음 실행 | 키 불필요. pypistats는 대량 조회 금지·캐시 필요(2절 메모). 약관(2026-11-21): npm 이용약관은 "불합리한 양의 요청"만 막고 한 달 500만 번 이상을 그 예로 듦, 초당 한도 숫자는 없음([약관](https://docs.npmjs.com/policies/open-source-terms), [다운로드 수 API](https://github.com/npm/registry/blob/main/docs/download-counts.md)). pypistats는 약관 페이지가 없고 API 문서가 "결과를 캐시하고 같은 주소는 하루 한 번 이상 부를 필요 없다", IP별 한도(숫자 없음) — 하루 1번인 우리 방식과 맞음([API](https://pypistats.org/api/)) |

갈래 분류(`classifyAfterBatch`)는 수집이 아니라 묶음 뒤에 도는 후처리라 이 표에 넣지 않았다. 후보 목록의 나머지 출처(소식·인기 신호·커뮤니티 리뷰, HF·HN·skills.sh 등)는 **v1에서 읽지 않는다**(코드의 `SCHEDULE_COLLECTORS`에 없음, "확인"이 `예`여도 쓰는 것이 아니다). **11-21에 둘을 더하기로 정했다(ADR 0033): 아래 표. 합쳐지기 전이라 위 "실제 사용" 표에는 아직 넣지 않았고, 합쳐진 뒤 코드 기준으로 옮긴다.**

### 0-1. 11-21 추가 (ADR 0033, 이 PR이 합쳐지면 위 "실제 사용" 표로 옮긴다)
| 출처 | 실제 요청 | 간격·몫 | 실패 처리(불변 2) | 키·약관 |
|---|---|---|---|---|
| GitHub 주제 태그 검색 (`collect-github-search.ts`, 흐름 상자 `fetch_stars`, 출처 줄 `github_search`) | `GET api.github.com/search/repositories?q=topic:<태그> stars:>=1000&sort=stars&order=desc&per_page=100&page=N`(태그는 `SEARCH_TAGS` 상수, 현재 `mcp-server`·`agent-skills`·`claude-skills`. `mcp`는 일반 앱이 섞이고 호출의 절반이라 뺌). 한 질의가 앞 1,000건까지만 줘서 넘으면 별 구간(`1000..N`)으로 이어 읽음. 결과 한 건에 별·포크·푸시·생성일·소유자 종류·라이선스·보관·설명이 같이 옴. 한 쪽 응답이 약 67만 자라 응답 한도를 200만 자로 올림(기본 50만 자) | 요청 사이 2초(검색 한도: 토큰 30회/분 = 2초에 1번). **검색 몫 40초, 수집기 전체(저장 포함) 90초.** 11-21 드라이런 기준 읽는 쪽 수는 `mcp`를 뺀 9쪽(mcp-server 3·agent-skills 4·claude-skills 2, `mcp`가 있을 때는 9쪽이 더해 18쪽이었다) | `GITHUB_TOKEN` 없음·모양 이상은 호출 없이 수집 오류. 403·429·422·모양 이상도 수집 오류. `incomplete_results:true`인 쪽은 1초 뒤 한 번 다시 읽고 그래도면 그 태그만 건너뜀(읽은 만큼 씀). 한 쪽도 못 읽었거나 시작 전에 시간이 지났으면 수집 오류(timeout). 못 읽은 태그는 `collect_error` 줄로 남긴다. **일부만 읽은 실행은 새 줄을 만들거나 두껍게 올리지 않고**, 있는 줄의 `clone_cluster`를 지우지 않으며(더하기만) `new_spike`는 그 저장소 자신의 데이터로 다시 계산한다 | 서버 토큰(저장소 정보 수집기와 같은 값, 값은 환경변수에만). 이용약관 확인하지 못함 |
| Hacker News (`collect-hn.ts`, 흐름 상자 `fetch_popularity`를 켜서 소스 `["hn"]`, 출처 줄 `hn`) | `GET hn.algolia.com/api/v1/search_by_date?tags=story&query=<키워드>&numericFilters=created_at_i><지금-7일>,points>=10&hitsPerPage=1000`(키워드 `mcp`·`model context protocol`·`claude code`·`agent skills`, 각 1번). **상태를 저장하지 않고 늘 최근 7일**을 읽는다(쓰기가 멱등) | 요청 사이 1초, 몫 20초(읽기 4번 + 저장). 한도: IP당 시간당 10,000회(2절 기록) | 키워드 하나가 실패하면 그 키워드만 `collect_error` 줄에 세고 계속하며, 모든 키워드를 못 읽었을 때만 이 상자가 실패한다(글이 없는 것과 못 읽은 것을 구분). 글의 주소가 GitHub 저장소·npm 패키지가 아니면 버림. 새 얇은 줄은 한 실행에 30개까지. 저장 루프가 몫을 넘으면 멈추고 요약에 표시(멱등이라 다음 실행이 이어 감) | 키 불필요. 이용약관 확인하지 못함 |

별 후보의 관문·점수·의심 규칙과 숫자(풀 별 ≥ 1,000, 두껍게 상한 100·누적 150)는 `docs/데이터설계.md` 8절 "별 후보". GeekNews(`news.hada.io/rss/news`, robots: 요약·링크 표시는 되고 학습용 수집은 금지)·Hugging Face·skills.sh·블로그 RSS는 제출 뒤(P-21 본 계산)로 둔다.

(처음 상태: 후보 목록. v1에 쓸 출처는 아직 고르지 않았다.) 조사일 2026-11-16, 서브에이전트가 공식 문서와 실제 호출로 확인했다(`docs/agents.md` 참고).
"확인"이 `아니오`인 칸은 확인하지 못한 것이다. 고른 뒤에는 간격, 한도·약관 확인 결과, 실패 처리를 출처마다 적는다.

## 1. 소식 (뉴스·릴리스)
| 출처 | 읽는 방법 | 키 | 주의 | 확인 |
|---|---|---|---|---|
| Anthropic 뉴스 | RSS 없음 → HTML 크롤링 | 불필요 | 크롤링 정책은 확인 못 함, 구조 바뀌면 깨짐 | 예 |
| Claude Code | `github.com/anthropics/claude-code/releases.atom`, `CHANGELOG.md`(raw) | 불필요 | | 예 |
| Claude API 릴리스 노트 | `platform.claude.com/docs/en/release-notes/overview` HTML | 불필요 | 피드 없음 | 예 |
| OpenAI | `openai.com/news/rss.xml`, `github.com/openai/codex/releases.atom`, API changelog는 HTML | 불필요 | changelog는 JS 렌더링 필요할 수 있음(확인 못 함) | 예 |
| Google | `blog.google/technology/ai/rss/`, `deepmind.google/blog/rss.xml`, `developers.googleblog.com/feeds/posts/default` | 불필요 | | 예 |
| GitHub Changelog | `github.blog/changelog/feed/` | 불필요 | | 예 |
| Hugging Face 블로그 | `huggingface.co/blog/feed.xml` | 불필요 | | 예 |
| 뉴스레터 | Simon Willison `simonwillison.net/atom/everything/`, Latent Space `latent.space/feed`, TLDR AI `tldr.tech/api/rss/ai`, AINews `news.smol.ai/rss.xml`, Import AI, Ben's Bites | 불필요 | The Batch 공식 피드는 확인 못 함 | 예 |
| 국내 | GeekNews `news.hada.io/rss/news`, 요즘IT, 네이버 D2, 카카오, 우아한형제들, 토스, AI타임스 | 불필요 | GeekNews robots: `ai-train=no, ai-input=yes` → 요약·링크 표시는 가능, 학습용 수집 금지 | 예 |
| arXiv | `export.arxiv.org/api/query?search_query=cat:cs.SE`, `rss.arxiv.org/rss/cs.AI` | 불필요 | 3초에 1회, 연결 1개. arXiv 보증처럼 표시 금지 | 예 |

## 2. 인기 신호 (트렌드)
| 출처 | 읽는 방법 | 키 | 주의 | 확인 |
|---|---|---|---|---|
| HF Hub | `huggingface.co/api/models?sort=trendingScore`, `/api/spaces?sort=trendingScore` | 선택 | 5분당 익명 500회 / 무료 계정 1,000회 | 예 |
| HF Daily Papers | `huggingface.co/api/daily_papers?date=YYYY-MM-DD` | 불필요 | Hub 한도와 같음 | 예 |
| GitHub Search | `api.github.com/search/repositories?q=topic:claude-code+stars:>100` | 선택 | 검색 10회/분(토큰 30회/분), 검색당 1,000건까지 | 예 |
| GitHub Trending | 공식 API 없음 → HTML 크롤링 | — | 구조 바뀌면 깨짐 | 예 |
| Hacker News | `hn.algolia.com/api/v1/search_by_date?query=...&tags=story` | 불필요 | IP당 10,000회/시간 | 예 |
| OpenRouter | `openrouter.ai/api/v1/models` (`created`로 새 모델 감지) | 문서상 필요, 실제로는 키 없이 응답 | 한도 문서 없음 | 예 |
| Artificial Analysis | `/api/v2/language/models/free` (옛 주소는 2026-11-04 종료) | 필요 | 무료 한도 확인 못 함 | 예 |
| LMArena | HF 데이터셋 `lmarena-ai/leaderboard-dataset` | 불필요 | 공식 API 확인 못 함 | 일부 |
| Product Hunt | RSS `producthunt.com/feed`, API v2 | API는 토큰 필요 | 상업적 이용 금지 | 예 |
| dev.to / Lobsters | `dev.to/api/articles?tag=ai`, `lobste.rs/hottest.json` | 불필요 | 한도 확인 못 함 | 예 |
| npm / PyPI | `api.npmjs.org/downloads/point/last-week/<pkg>`, `pypi.org/pypi/<pkg>/json`, pypistats | 불필요 | pypistats는 대량 조회 금지, 캐시 필수 | 예 |
| ThoughtWorks Radar | 공식 API·데이터 없음 | — | 콘텐츠 라이선스 불명 → 쓰지 않음 | 예 |

## 3. 레지스트리 (스킬·MCP·플러그인)
| 출처 | 읽는 방법 | 키 | 주의 | 확인 |
|---|---|---|---|---|
| 공식 MCP Registry | `registry.modelcontextprotocol.io/v0.1/servers?updated_since=...` | 불필요 | preview 단계(초기화 가능), 1시간에 1회 수집 권장, 삭제된 서버도 포함 | 예 |
| Smithery | `api.smithery.ai/servers?q=` | 문서상 필요, 실제로는 키 없이 응답 | 한도 확인 못 함 | 예 |
| Claude 플러그인 마켓 | `anthropics/claude-plugins-official`의 `.claude-plugin/marketplace.json` | 불필요 | 제3자 마켓은 GitHub 검색으로 | 예 |

## 4. 보안 점검
| 출처 | 읽는 방법 | 키 | 주의 | 확인 |
|---|---|---|---|---|
| OSV | `POST api.osv.dev/v1/query` | 불필요 | 요청 횟수 제한 없음, 응답 크기 HTTP/1.1에서 32MiB(FAQ 2026-11-18 확인, https://google.github.io/osv.dev/faq/) | 예 |
| OpenSSF Scorecard | `api.securityscorecards.dev/projects/github.com/<owner>/<repo>` | 불필요 | 정기 검사 목록에 없으면 404(흔함) | 예 |
| deps.dev | `api.deps.dev/v3/systems/npm/packages/<pkg>` | 불필요 | 한도 확인 못 함 | 예 |
| GitHub Advisories | `api.github.com/advisories` | 선택 | REST 한도와 같음 | 예 |
| Socket.dev | REST API | 필요 | 무료 500회/시간 | 예 |

## 5. 커뮤니티 리뷰
| 출처 | 읽는 방법 | 키 | 주의 | 확인 |
|---|---|---|---|---|
| HN 댓글 | Algolia `tags=comment,story_<id>` | 불필요 | 10,000회/시간 | 예 |
| GitHub Issues | REST `/repos/{o}/{r}/issues` | 선택 | Discussions는 GraphQL + 토큰 필요 | 예 |
| GeekNews 댓글 | 댓글 RSS 없음 → HTML 크롤링 | — | `ai-train=no` | 예 |
| Reddit | `.json` 403, OAuth는 사전 승인 필요 | 필요 | 공식 약관을 열지 못함. 수집 못 할 가능성 높음 | 아니오 |
| HF Discussions / dev.to 댓글 | HF discussions API, `dev.to/api/comments?a_id=` | 불필요 | 호출해 보지 않음 | 아니오 |

## 6. 모델 지원 종료 (PRD-F38, 2026-11-20 추가)
| 출처 | 읽는 방법 | 키 | 주의 | 확인 |
|---|---|---|---|---|
| Anthropic 모델 지원 종료 | `platform.claude.com/docs/en/about-claude/model-deprecations`(docs.claude.com에서 넘어감) | 불필요 | 사람이 읽고 표로 옮김(정기 수집 아님). 옛 모델은 "Deprecation history"에만 있음 | 예(11-20) |
| OpenAI 지원 종료 | `developers.openai.com/api/docs/deprecations`(platform.openai.com에서 넘어감) | 불필요 | 쪽이 길어 앞부분만 글 그대로 읽힘. 글 그대로 읽은 줄만 옮김 | 예(11-20) |
| Google Gemini 지원 종료 | `aistudio.google.com/docs/deprecations`(ai.google.dev에서 넘어감) | 불필요 | 날짜는 "가장 이르면 이날" | 예(11-20) |
| GitHub 트리 + raw | `api.github.com/repos/{o}/{r}/git/trees/HEAD?recursive=1`, `raw.githubusercontent.com` | 선택(서버 토큰) | 토큰 없으면 시간당 60번을 저장소 확인 · 스킬 목록과 나눠 씀. 트리가 크면 GitHub가 잘라 줌(`truncated`) | 예(11-20, 공개 저장소 2곳) |
