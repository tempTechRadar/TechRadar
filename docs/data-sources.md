# 데이터 출처 (v1 출처 정함, 2026-11-17)

상태: **v1 출처를 골랐다(2026-11-17, ADR 0008):** 1순위 OSV, 공식 MCP 레지스트리, GitHub 저장소 정보(서버 토큰), npm·PyPI 다운로드 수(`api.npmjs.org/downloads/point/last-week/<패키지>`, `pypistats.org/api/packages/<패키지>/recent`, 2026-11-17 키 없이 호출 확인) / 3순위 Hugging Face Hub, Hacker News, Firecrawl로 skills.sh 인기 페이지 1곳(스킬 설치 수. robots.txt: 공개 페이지 허용, `/api/`·`/search`만 막음, 2026-11-17 확인. 이용약관은 확인 전). 간격·한도·실패 처리는 spec에서 출처마다 적는다. 아래는 조사한 후보 목록 전체다.

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
