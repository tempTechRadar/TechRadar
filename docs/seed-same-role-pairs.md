# 같은 역할 처음 짝 목록 — 초안 (SQ2, P-14)

**상태: 초안. 팀이 확인하기 전까지 시드로 넣지 않는다.** 주인: 황재웅(B). 근거: spec SQ2 "팀(Claude 초안 가능)", SPEC-4.4, ADR 0015(시드는 관리자 확인 없이 확정으로 넣음).

## 어떻게 만들었나
- 후보 패키지 이름을 **npm 레지스트리에서 하나씩 조회**해 실제로 있는지, 설명과 지원 종료(deprecated) 표시가 있는지 확인했다(조회일 2026-11-19). 이름만 기억으로 쓴 것은 없다.
- "같은 역할"은 **두 패키지의 공개 설명을 읽고 내가 판단한 것**이다. 도메인 정답이 아니므로 팀이 고친다.
- 확신: **높음** = 설명만 봐도 같은 일을 한다 / **근접** = 비슷하지만 범위나 방향이 다르다(팀이 빼거나 두기를 정한다).
- 상태: **유지** = npm에 지원 종료 표시 없음 / **종료** = npm이 지원 종료·보관(archived)으로 표시함. 종료된 쪽이 짝에 들어 있으면 "내가 쓰는 건 종료됐고 같은 역할의 새 기술이 있다"는 알림 장면에는 맞지만, 새 기술(알림에 나오는 쪽)로는 부적절하다.

## 초안 20쌍

| # | 역할(작은 갈래 후보) | 기술 A (`tech_key`) | 기술 B (`tech_key`) | 확신 | A 상태 | B 상태 | 비고 | 팀 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | MCP 전송 변환 프록시(표준입출력 ↔ SSE) | `npm:mcp-proxy` | `npm:supergateway` | 높음 | 유지 | 유지 | 둘 다 stdio 서버를 SSE로 노출 | ☐ |
| 2 | 원격 MCP 연결 프록시 | `npm:mcp-remote` | `npm:supergateway` | 근접 | 유지 | 유지 | spec 4.4 예시. 방향이 반대(mcp-remote는 원격 서버를 로컬 클라이언트에 연결, supergateway는 로컬 stdio를 원격으로 노출) | ☐ |
| 3 | 파일 시스템 | `npm:@modelcontextprotocol/server-filesystem` | `npm:@cyanheads/filesystem-mcp-server` | 높음 | 유지 | 유지 | spec 4.4 예시 | ☐ |
| 4 | 브라우저 자동화 | `npm:@playwright/mcp` | `npm:@modelcontextprotocol/server-puppeteer` | 높음 | 유지 | **종료** | Puppeteer 쪽은 보관됨 | ☐ |
| 5 | 브라우저 자동화 | `npm:@playwright/mcp` | `npm:@browsermcp/mcp` | 높음 | 유지 | 유지 | | ☐ |
| 6 | 브라우저 자동화 | `npm:@playwright/mcp` | `npm:@executeautomation/playwright-mcp-server` | 높음 | 유지 | 유지 | 같은 Playwright 기반 | ☐ |
| 7 | 브라우저 자동화·점검 | `npm:@playwright/mcp` | `npm:chrome-devtools-mcp` | 근접 | 유지 | 유지 | 자동화 vs 개발자 도구 점검 | ☐ |
| 8 | 웹 검색 | `npm:@modelcontextprotocol/server-brave-search` | `npm:exa-mcp-server` | 높음 | **종료** | 유지 | | ☐ |
| 9 | 웹 검색 | `npm:@modelcontextprotocol/server-brave-search` | `npm:tavily-mcp` | 높음 | **종료** | 유지 | | ☐ |
| 10 | 웹 검색 | `npm:exa-mcp-server` | `npm:tavily-mcp` | 높음 | 유지 | 유지 | 둘 다 유지: 데모에 쓰기 좋음 | ☐ |
| 11 | Slack 연동 | `npm:@modelcontextprotocol/server-slack` | `npm:slack-mcp-server` | 높음 | **종료** | 유지 | | ☐ |
| 12 | PostgreSQL 연동 | `npm:@modelcontextprotocol/server-postgres` | `npm:@henkey/postgres-mcp-server` | 높음 | **종료** | 유지 | 보관됨 | ☐ |
| 13 | Kubernetes 연동 | `npm:mcp-server-kubernetes` | `npm:kubernetes-mcp-server` | 높음 | 유지 | 유지 | | ☐ |
| 14 | Google Drive 연동 | `npm:@modelcontextprotocol/server-gdrive` | `npm:@isaacphi/mcp-gdrive` | 높음 | **종료** | 유지 | | ☐ |
| 15 | Notion 연동 | `npm:@notionhq/notion-mcp-server` | `npm:@suekou/mcp-notion-server` | 높음 | 유지 | 유지 | A는 Notion 공식 | ☐ |
| 16 | 문서 조회 | `npm:@upstash/context7-mcp` | `npm:@arabold/docs-mcp-server` | 높음 | 유지 | 유지 | 둘 다 라이브러리 문서를 찾아 줌 | ☐ |
| 17 | UI 컴포넌트 문서 | `npm:@magicuidesign/mcp` | `npm:@heroui/react-mcp` | 근접 | 유지 | 유지 | 서로 다른 UI 라이브러리의 문서 | ☐ |
| 18 | 단계적 사고 | `npm:@modelcontextprotocol/server-sequential-thinking` | `npm:@waldzellai/clear-thought` | 근접 | 유지 | 유지 | B가 범위가 더 넓음(사고 도구 모음) | ☐ |
| 19 | 웹 수집·검색 | `npm:firecrawl-mcp` | `npm:exa-mcp-server` | 근접 | 유지 | 유지 | 긁어오기 vs 검색 | ☐ |
| 20 | 브라우저 점검 | `npm:@agentdeskai/browser-tools-mcp` | `npm:chrome-devtools-mcp` | 근접 | 유지 | 유지 | 콘솔·네트워크 보기 | ☐ |

요약: 높음 14쌍 / 근접 6쌍. 한쪽이 종료인 짝은 6쌍(4, 8, 9, 11, 12, 14).

## 시드로 넣기 전에 정할 것 (아직 안 함)
1. **팀이 위 20쌍을 확인한다**: 빼거나 바꿀 것, 근접 6쌍을 둘지. (이 파일의 "팀 확인" 칸)
2. **종료 표시가 붙은 쪽을 새 기술로 알림에 낼지**: 시연에서 "내 기술(A) ↔ 새 기술(B)"로 나오는 쪽은 `유지`인 것이 자연스럽다. 시드에는 방향이 없으므로(`tech_a < tech_b`는 id 순서) 알림 규칙이 "새로 들어온 쪽이 알림 대상"이면 문제없다.
3. **시드의 확정자·확정 시각 칸**: `status='confirmed'`면 `confirmed_at`이 필수(DB 제약). `confirmed_by`는 비워도 되는지(ADR 0015가 "P-14 때 정한다"고 남김).
4. **카탈로그에 이 기술들이 있어야 한다**: `tech_relations`는 `technologies` 줄을 가리키므로, 시드 마이그레이션이 `technologies`에 없는 기술을 먼저 넣고(이름·유형·갈래), 그다음 짝을 넣는다. 갈래(`category_id`)는 위 "역할" 열을 쓰되 `categories` 시드와 맞춰야 한다.
5. **시드를 넣는 방식**: 마이그레이션(김영식 리뷰 필수, plan)이 맞다. DB는 운영과 같은 곳이라 적용 전 사용자 승인이 필요하다.

## 확인하지 못한 것
- 두 패키지가 "같은 역할"인지는 공개 설명 기준의 판단이고, 실제로 써 보거나 코드를 읽어 확인하지 않았다.
- 레지스트리 조회는 2026-11-19 시점이다. 이후 지원 종료 표시가 바뀔 수 있다.
- 각 기술의 GitHub 저장소·출처 링크는 이 초안에 넣지 않았다(비교표의 출처는 P-9 수집이 채운다).
