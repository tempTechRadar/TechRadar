# 시험용 가상 스킬 (채점용)

**모두 가상입니다.** 위험 패턴 검사(`lib/domain/risk-patterns.ts`)가 기대 등급을 내는지 채점하려고(SPEC-10 G6–G9) 일부러 만든 글입니다. 실제 서비스가 아니며, 주소는 존재하지 않는 `.invalid`만 씁니다. **실행하지 마세요.**

| 폴더 | 사례 | 심은 것 | 기대 등급 |
|---|---|---|---|
| `skill-a-remote-exec` | G6 | P1 원격 실행 (`curl … \| sh`) | 위험 |
| `skill-b-secret-leak` | G7 | P2 비밀값 밖으로 보내기 (`.env`를 읽어 바깥 주소로) | 위험 |
| `skill-c-wide-permission` | G8 | P3 넓은 권한 (`allowed-tools: Bash(*)`) | 주의 |
| `skill-d-clean` | G9 | 없음 (깨끗한 대조군) | 통과 |
