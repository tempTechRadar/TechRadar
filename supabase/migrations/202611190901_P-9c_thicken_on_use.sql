-- P-9c 코드 검토 반영(ADR 0019 고침)
-- ① 쓰기 시작하면 두껍게: 얇게 있던 기술(공식 MCP 레지스트리가 먼저 넣은 것)을 누군가 내 기술로 두면 두껍게 올린다.
--    첫 읽기뿐 아니라 직접 추가·가져오기도 사용자 연결로 my_technologies에 넣는데, 그 연결은 technologies를 고칠 수 없다.
--    그래서 넣는 자리마다 코드를 두지 않고 my_technologies insert 트리거 한 곳에서 올린다(security definer).
-- ② 공식 조직 목록의 값을 이름공간 전체로: 'openai' 같은 낱말은 dev.openai·net.openai 처럼 아무 최상위 도메인에도 맞았다.
--    레지스트리가 검증하는 이름공간(io.github.<소유자> 또는 <tld>.<조직>) 전체를 적는다. 처음 값은 팀 추정이라 관리자가 고친다.
create function public.thicken_used_tech() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tech_id is not null then
    update public.technologies
       set depth = 'thick',
           thick_reasons = case when 'used' = any(coalesce(thick_reasons, '{}')) then thick_reasons
                                else array_append(coalesce(thick_reasons, '{}'), 'used') end
     where id = new.tech_id
       and (depth = 'thin' or not ('used' = any(coalesce(thick_reasons, '{}'))));
  end if;
  return new;
end;
$$;
revoke execute on function public.thicken_used_tech() from public, anon, authenticated;

create trigger my_technologies_thicken after insert on public.my_technologies
  for each row execute function public.thicken_used_tech();

delete from public.rule_lists
 where kind = 'official_org' and value in ('modelcontextprotocol', 'anthropics', 'openai');
insert into public.rule_lists (kind, value) values
  ('official_org', 'io.github.modelcontextprotocol'),
  ('official_org', 'io.github.anthropics'),
  ('official_org', 'io.github.openai')
on conflict do nothing;
