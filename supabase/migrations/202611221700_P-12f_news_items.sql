-- P-12f ⑥ · M7: 바깥 소식(news_items)과 출처 줄 news. 출처: docs/data-sources.md "소식 피드 후보와 약관"(DocsChecker 2026-11-21), ADR 0038(소식 수집기 · 약관).
-- 공개 읽기(로그인 없이도 현황 "소식"에서 보임) · 쓰기는 서버(서비스 키)만. 같은 주소(url)는 한 줄이라 같은 소식을 다시 읽어도 늘지 않는다(불변 3).
-- 제목 · 링크 · 날짜 · 짧은 요약만 둔다(약관 조건: 원문 링크를 같이 보임, AI 학습에 쓰지 않음). 검사 한도는 수집기(lib/domain/news-parse.ts)가 보내는 값과 같다.
-- 추가만 한다(새 표 + sources 한 줄): 옛 코드는 그대로 돈다. 운영 적용 전에 supabase/tests/news_items_p12f.sql을 한 번 돌린다(끝에서 예외로 모두 되돌림).

create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_key text not null check (char_length(source_key) between 1 and 64),
  title text not null check (char_length(title) between 1 and 300),
  url text not null check (char_length(url) <= 2000 and url ~ '^https://'),
  summary text check (summary is null or char_length(summary) <= 400),
  published_at timestamptz not null,
  tools text[] not null default '{}',
  official boolean not null default true
);
create unique index news_items_url on public.news_items (url);
create index news_items_published on public.news_items (published_at desc);

alter table public.news_items enable row level security;
revoke all on public.news_items from anon, authenticated;
grant select on public.news_items to anon, authenticated;
create policy news_items_select_all on public.news_items for select to anon, authenticated using (true);

-- 관리자가 소식 수집을 끄는 스위치(IA-15)이자 "하루 한 번" 기준 시각(last_synced_at). sources.name은 unique라 여러 번 돌려도 한 줄이다.
insert into public.sources (name, method, priority) values ('news', 'api', 3)
on conflict (name) do nothing;
