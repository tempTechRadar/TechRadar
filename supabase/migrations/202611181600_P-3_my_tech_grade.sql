-- P-3 · 내 버전의 보안 등급을 my_technologies에(erd 2.2 "왜 등급이 두 곳에")
-- technologies.grade는 버전이 없는 키라 다른 버전을 쓰는 사람끼리 덮어쓴다(P-3 코드 검토, 사용자 결정 "칸 추가").
alter table public.my_technologies
  add column grade text not null default 'unknown' check (grade in ('pass', 'caution', 'danger', 'unknown')),
  add column grade_reason text,
  add column grade_evidence jsonb,
  add column grade_rule_version text,
  add column graded_at timestamptz,
  add column last_checked_ok_at timestamptz;

-- 등급·읽기 결과는 서버만 쓴다. 사용자가 고칠 수 있는 칸만 열어 둔다(숨김, 이름만 직접 추가, 버전).
revoke update on public.my_technologies from authenticated;
grant update (hidden_at, manual_name, version) on public.my_technologies to authenticated;
