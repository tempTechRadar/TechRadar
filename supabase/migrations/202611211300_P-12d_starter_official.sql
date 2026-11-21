-- P-12d 입문 세트의 Anthropic 공식 스킬 10 · 플러그인 6에 공식 표시(11-21 사용자 승인, ADR 0031 적용 뒤 리뷰).
-- anthropics/skills · anthropics/claude-plugins-official 저장소의 입문 세트 줄만. 기술 상세의 "공식 여부"가 "공식"으로 보인다. 여러 번 돌려도 같다.
update public.technologies set is_official = true
where signals ->> 'starter_set' = 'true'
  and (tech_key like 'skill:anthropics/skills/%' or tech_key like 'plugin:anthropics/claude-plugins-official/%')
  and is_official = false;
