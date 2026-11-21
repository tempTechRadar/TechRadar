-- P-21a · 별 후보 검색(GitHub 주제 태그)의 출처 줄(ADR 0030 4번, data-sources 0-1, 흐름 상자 fetch_stars)
-- github 줄을 같이 쓰면 관리자가 끌 때 저장소 정보 수집까지 꺼지고 수집 자료(observations)의 출처가 섞여서 줄을 따로 둔다(IA-15).
-- sources.name은 unique라 여러 번 돌려도 한 줄이다.
insert into public.sources (name, method, priority) values ('github_search', 'api', 3)
on conflict (name) do nothing;
