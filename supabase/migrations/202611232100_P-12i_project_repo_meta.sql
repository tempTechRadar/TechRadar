-- P-12i 레포 기본 정보: 등록 · 다시 읽기 때 부르는 GitHub 저장소 API 응답에서 설명 · 주 언어 · 마지막 푸시를 projects에 남긴다. 작업 I-P-12i-repo-meta.
-- 쓰기는 서버(서비스 키, first-read.ts saveRepoMeta). 읽기는 기존 RLS 그대로(projects_select: 본인 + 관리자, 손님은 정책 없음 = 못 읽음, 불변 5).
-- repo_meta_at = 마지막으로 읽은 시각(성공만). 읽기 실패는 예전 값을 지우지 않고(불변 4) repo_meta_error에 수집 오류 종류를 남긴다(불변 2), 성공하면 비운다.
-- 코드는 이 칸이 없어도 깨지지 않는다(저장 실패는 로그만, #135 방식). 시험: supabase/tests/project_repo_meta_p12i.sql
alter table public.projects
  add column if not exists repo_description text check (char_length(repo_description) <= 300),
  add column if not exists repo_language text check (char_length(repo_language) <= 60),
  add column if not exists repo_pushed_at timestamptz,
  add column if not exists repo_meta_at timestamptz,
  add column if not exists repo_meta_error text check (repo_meta_error in ('timeout', 'network', 'rate_limited', 'http_status', 'parse'));
