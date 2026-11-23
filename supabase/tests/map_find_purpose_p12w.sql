-- P-12w ai_calls.purpose 'map_find' 시험(202611240600). 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: 마이그레이션 적용 뒤 운영 MCP execute_sql로 1번(사용자 승인 뒤). "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
do $$
declare
  n int; msg text := ''; v text;
begin
  foreach v in array array['map_find', 'draft', 'scenario', 'classify', 'chatbot', 'blueprint_check', 'translate', 'blueprint_guide'] loop
    insert into public.ai_calls (purpose, user_id, input_hash, status) values (v, null, 'p12w-' || v, 'succeeded');
    get diagnostics n = row_count; msg := msg || v || '=' || n || ';';
  end loop;
  begin
    insert into public.ai_calls (purpose, user_id, input_hash, status) values ('find', null, 'p12w-bad', 'succeeded');
    msg := msg || 'unknown=OPEN;';
  exception when check_violation then msg := msg || 'unknown=blocked;'; end;
  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: map_find=1;draft=1;scenario=1;classify=1;chatbot=1;blueprint_check=1;translate=1;blueprint_guide=1;unknown=blocked;
end $$;
