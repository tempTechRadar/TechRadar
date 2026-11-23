-- P-12w 지도 찾기 도우미: ai_calls.purpose에 'map_find'를 더한다. 작업 I-P-12w-map-finder(FrontLead).
-- 제약 이름은 ai_calls_purpose_check, 마지막으로 바꾼 곳은 202611240500(P-12s blueprint_guide). 옛 값 7개를 모두 두고 하나만 더해 지금 있는 줄은 모두 통과한다.
-- 찾기 대화는 서버에 저장하지 않는다(브라우저 sessionStorage). 서버에는 호출 기록(ai_calls)만 남아 하루 한도를 센다.
-- 운영 적용 전에 supabase/tests/map_find_purpose_p12w.sql을 한 번 돌린다(끝에서 예외로 모두 되돌림).
alter table public.ai_calls drop constraint ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('draft', 'scenario', 'classify', 'chatbot', 'blueprint_check', 'translate', 'blueprint_guide', 'map_find'));
