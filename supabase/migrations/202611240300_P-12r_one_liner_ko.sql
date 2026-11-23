-- P-12r: 기술마다 한국어 개요(초안, 운영 적용 전 — 사용자 승인 필요). 작업 I-P-12r-ko-overview.
-- technologies에 한국어 개요 칸 3개를 더한다. 쓰기는 서버(서비스 키)만: 사용자 쓰기 길은 열지 않는다(authenticated는 technologies 쓰기가 막혀 있고, 관리자 갈래 수정 열만 허용 — 새 칸은 거기 없음).
-- 읽기는 technologies 정책 그대로(공개 목록은 서비스 키 경로, 로그인한 사용자는 표 전체 읽기).
--   one_liner_ko      한국어 한 문장(≤200자. 모델에게는 80자 이내로 요청, 파서가 100자 넘는 것은 버림)
--   one_liner_ko_src  번역한 영어 원문 그대로. 원문(one_liner)이 바뀌면 둘이 달라져서 "다시 번역할 줄"이 되고, 화면은 달라진 번역을 현재 설명처럼 보이지 않는다
--   one_liner_ko_at   번역한 때
-- ai_calls.purpose에 'translate'를 더한다(제약 이름은 운영에서 읽어 확인한 ai_calls_purpose_check, 마지막으로 바꾼 곳은 202611221300 M4). 값만 넓히는 변경이라 지금 있는 줄은 모두 통과한다.
-- 추가만 한다(새 칸 + 허용 값): 옛 코드는 그대로 돈다. 운영 적용 전에 supabase/tests/one_liner_ko_p12r.sql을 한 번 돌린다(끝에서 예외로 모두 되돌림).

alter table public.technologies
  add column one_liner_ko text check (one_liner_ko is null or char_length(one_liner_ko) <= 200),
  add column one_liner_ko_src text,
  add column one_liner_ko_at timestamptz;

alter table public.ai_calls drop constraint ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('draft', 'scenario', 'classify', 'chatbot', 'blueprint_check', 'translate'));
