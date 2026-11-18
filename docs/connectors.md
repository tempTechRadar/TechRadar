# 커넥터 사용 기록

서로 다른 서비스 2개 이상을 실제 일에 쓴다. 토큰은 적지 않는다.

| 날짜 | 서비스 | 목적 | 실제로 한 일 | 결과 링크·캡처 | 앱 실행에도 쓰나 |
|---|---|---|---|---|---|
| 2026-11-17 | abbsbook (abigbigsketchbook MCP, 로컬 설치) | 프로젝트 진행 과정을 TechRadar 스케치북에 기록 | MCP 설치(체크섬 검증) 후 list_accounts·list_sketchbooks·verify_connection으로 연결 확인, 「에이전트 연동 완료」 이벤트 1개 생성 | [이벤트](https://abigbigsketchbook.com/s/74bbcf40-4ec4-4f2b-b04f-5b036fb9ae3e?event=8346912c-7d9f-50f7-a83e-8debf93661e3) | 아니오(개발 기록용) |
| 2026-11-17 | Supabase (MCP 커넥터) | prd의 저장소 선택 근거 확인 | `list_projects`로 계정의 프로젝트 3개 확인, 켜져 있는 "tech-radar-agent"의 `list_tables`(public)로 테이블 20개·행 수만 읽음. 아무것도 바꾸지 않음 | `docs/prd.md` 4절 | 예(앱 DB로 쓸 예정, 새 팀 프로젝트) |
| 2026-11-17 | Supabase (MCP 커넥터) | 데이터설계: 기존 "tech-radar-agent"에서 가져올 것 고르기 | `list_tables`(자세히)로 칸 구조, `execute_sql`로 SELECT만(기술 종류·관계 종류·설명 칸별 수, 기술 이름 목록). 아무것도 바꾸지 않음 | 채팅 보고, `docs/데이터설계.md`(작성 예정) | 아니오(이전 프로젝트 조사) |
| 2026-11-18 | Supabase (MCP 커넥터) | P-1: 새 팀 프로젝트 만들기 시도, 개발 전 점검 | `create_project`는 자동 권한 검사에서 막혀 사람이 직접 만듦. 점검 도우미가 `list_projects`·`list_tables`·`list_migrations`로 조회만(테이블 0개, 마이그레이션 0개). 아무것도 바꾸지 않음 | 채팅 보고 | 예(앱 DB) |
| 2026-11-18 | Vercel (MCP 커넥터) | 개발 전 점검: 배포 상태 확인 | 점검 도우미가 `list_projects`·`get_project`·`list_deployments`로 조회만(운영 배포 READY, 미리보기는 SSO 보호). 연결·배포 자체는 사람이 함. 아무것도 바꾸지 않음 | https://techradar-theta.vercel.app | 예(배포) |
| 2026-11-18 | Supabase (MCP 커넥터) | P-2: M0 테이블·RLS를 실제 DB에 적용하고 시험 | 사용자 승인("적용해") 뒤 `apply_migration` 2번(테이블·RLS, 함수 권한), `get_advisors`(보안 점검), `list_tables`(대조), `execute_sql`로 RLS 시험(시험 계정을 만들고 끝에서 모두 되돌림, 남은 줄 0 확인) | `docs/erd.md` 7절, `docs/qa.md` | 예(앱 DB) |
| 2026-11-18 | Supabase (MCP 커넥터) | P-3: `my_technologies`에 내 버전 등급 칸 적용과 시험 | 사용자 승인("적용하고 시험") 뒤 `apply_migration` 1번(`p3_my_tech_grade`), `execute_sql`로 시험(만들고 끝에서 되돌림)·남은 줄 0과 칸·권한 확인, `get_advisors`(새 경고 없음, 기존 의도한 2건만) | `docs/erd.md` 7절, `docs/qa.md` | 예(앱 DB) |
