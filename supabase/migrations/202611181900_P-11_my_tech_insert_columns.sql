-- P-11 보안 검토 반영(intent I-P-11-my-tech 열린 질문 ③): 사용자는 내 기술을 "넣을 수만" 있고, 등급·읽은 결과는 서버만 쓴다(erd "쓰기는 서버").
-- 앞 마이그레이션은 행 정책만 있어서 사용자가 grade·grade_evidence 같은 서버 칸을 채워 넣은 채로 만들 수 있었다(update는 P-3에서 이미 열 제한).
-- 저장소 읽기는 서비스 키 연결이라 영향이 없다. 사용자 연결 insert는 직접 추가(lib/server/my-tech.ts)와 내 컴퓨터 가져오기(lib/server/local-import.ts) 둘뿐이고 아래 7칸만 보낸다.
revoke insert on public.my_technologies from authenticated;
grant insert (owner_id, added_by, project_id, tech_id, manual_name, origin, version) on public.my_technologies to authenticated;

-- origin은 사용자가 쓰는 두 값만: "repo"(저장소에서 읽음)는 서버가 읽었을 때만 붙는다. 사용자가 repo로 넣으면 설치 프롬프트의 출처·범위가 바뀌고
-- 다시 읽을 때 읽지 못한 줄로 표시된다(코드 검토). 정책은 기존 my_tech_insert에 조건 하나만 더한 것이고, 서비스 키 연결은 정책을 건너뛴다.
alter policy my_tech_insert on public.my_technologies
  with check (owner_id = (select auth.uid()) and added_by = (select auth.uid()) and origin in ('manual', 'import')
    and exists (select 1 from public.projects p where p.id = my_technologies.project_id and p.owner_id = (select auth.uid())));
