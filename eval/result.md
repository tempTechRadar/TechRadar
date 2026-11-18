# 채점 결과 (PRD-F30)

- 언제: 2026. 11. 18. 14시 24분 10초 · 등급 규칙 v1 · 정답: eval/gold.json (SPEC-10)
- 사건: 맞게 울림 6 · 맞게 조용함 6 · **놓침 0** · **잘못 울림 0** (사례 12)
- 등급 맞음 8/12 · 실행 실패 0

| 사례 | 대상 | 출처 | 기대 등급 | 실제 등급 | 등급 | 사건 판정 | 비고 |
|---|---|---|---|---|---|---|---|
| G1 | npm mcp-remote | 실수집 | 위험 | 위험 | 맞음 | 맞음 |  |
| G2 | npm @modelcontextprotocol/inspector | 실수집 | 위험 | 위험 | 맞음 | 맞음 |  |
| G3 | npm @modelcontextprotocol/server-filesystem | 실수집 | 위험 | 위험 | 맞음 | 맞음 |  |
| G4 | PyPI mcp | 실수집 | 위험 | 위험 | 맞음 | 맞음 |  |
| G5a | @modelcontextprotocol/inspector 최신 | 실수집 | 통과 또는 주의 | 찾지 못함 | 다름 | 맞음 |  |
| G5b | @modelcontextprotocol/server-filesystem 최신 | 실수집 | 통과 또는 주의 | 찾지 못함 | 다름 | 맞음 |  |
| G5c | mcp-remote 최신 | 실수집 | 통과 또는 주의 | 찾지 못함 | 다름 | 맞음 |  |
| G5d | mcp 최신 | 실수집 | 통과 또는 주의 | 찾지 못함 | 다름 | 맞음 |  |
| G6 | 시험용 스킬 skill-a-remote-exec | 가상 | 위험 | 위험 | 맞음 | 맞음 |  |
| G7 | 시험용 스킬 skill-b-secret-leak | 가상 | 위험 | 위험 | 맞음 | 맞음 |  |
| G8 | 시험용 스킬 skill-c-wide-permission | 가상 | 주의 | 주의 | 맞음 | 맞음 |  |
| G9 | 시험용 스킬 skill-d-clean | 가상 | 통과 | 통과 | 맞음 | 맞음 |  |
