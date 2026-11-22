import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeFromOsv, type OsvVuln, type RepoCheck } from "./grade.ts";

// 통과 = OSV 취약점 0건 + 저장소 확인이 신선(확인 7일 안·마지막 푸시 90일 안·상태 active·못 찾음 0). SPEC-1. 못 채우면 "찾지 못함"(불변 2).
const NOW = Date.parse("2026-11-21T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const repo = (over: Partial<RepoCheck> = {}): RepoCheck => ({ status: "active", activityAt: ago(3), checkedAt: ago(1), missedCount: 0, repoName: "acme/tool", license: "MIT", nowMs: NOW, ...over });
const vuln = (severity: string): OsvVuln => ({ id: "GHSA-test", database_specific: { severity } });

test("취약점 0건이고 저장소 확인이 신선하면 통과, 버전을 몰라도 같다", () => {
  const r = gradeFromOsv("1.0.0", [], repo());
  assert.deepEqual([r.grade, r.evidence.length, r.causeId], ["pass", 0, null]);
  assert.match(r.reason, /최근 3개월/);
  assert.match(r.reason, /acme\/tool/); // 어느 저장소를 근거로 했는지 보인다: 패키지와 저장소가 같은지는 사람이 알아본다
  assert.equal(gradeFromOsv(null, [], repo()).grade, "pass");
});

test("P-9가 어느 저장소를 읽었는지 모르면(이름 없음) 통과가 아니다: 근거 저장소를 밝힐 수 없는 통과는 주지 않는다", () => {
  assert.equal(gradeFromOsv("1", [], repo({ repoName: null })).grade, "unknown");
  assert.equal(gradeFromOsv("1", [], repo({ repoName: "" })).grade, "unknown");
});

test("저장소 정보를 안 주면 늘 찾지 못함: 통과는 저장소 확인이 있어야만(OSV만으로는 안 준다)", () => {
  assert.equal(gradeFromOsv("1.0.0", []).grade, "unknown");
});

test("저장소가 신선해도 취약점이 있으면 통과가 아니다: 주의·위험이 먼저", () => {
  assert.equal(gradeFromOsv("1.0.0", [vuln("MODERATE")], repo()).grade, "caution");
  assert.equal(gradeFromOsv("1.0.0", [vuln("HIGH")], repo()).grade, "danger");
});

test("경계: 확인 7일·푸시 90일까지는 통과, 하루라도 넘으면 찾지 못함", () => {
  assert.equal(gradeFromOsv("1", [], repo({ checkedAt: ago(7) })).grade, "pass");
  assert.equal(gradeFromOsv("1", [], repo({ checkedAt: ago(7.01) })).grade, "unknown");
  assert.equal(gradeFromOsv("1", [], repo({ activityAt: ago(90) })).grade, "pass");
  assert.equal(gradeFromOsv("1", [], repo({ activityAt: ago(90.01) })).grade, "unknown");
});

test("수집이 멈춰 확인 시각이 낡았으면, 푸시 시각이 최근처럼 보여도 통과가 아니다(거짓 통과 막기)", () => {
  assert.equal(gradeFromOsv("1", [], repo({ checkedAt: ago(30), activityAt: ago(31) })).grade, "unknown");
});

test("주의 조건(SPEC-1 ②③④): 중단·사라짐·1년 넘게 쉼·라이선스 없음이면 취약점이 없어도 통과가 아니라 주의, 이유에 까닭이 보인다", () => {
  const cases: [Partial<RepoCheck>, RegExp][] = [
    [{ status: "deprecated" }, /중단/],
    [{ status: "gone" }, /사라졌/],
    [{ status: "dormant" }, /1년 넘게/],
    [{ license: "none" }, /라이선스가 없/],
  ];
  for (const [over, why] of cases) {
    const r = gradeFromOsv("1", [], repo(over));
    assert.deepEqual([r.grade, why.test(r.reason)], ["caution", true], JSON.stringify(over));
  }
  // 라이선스를 알아보지 못한 other·알려진 이름·읽은 적 없음(null)은 라이선스 없음이 아니다
  for (const license of ["other", "MIT", null]) assert.equal(gradeFromOsv("1", [], repo({ license })).grade, license === null ? "pass" : "pass", String(license));
});

test("취약점이 있으면 그것이 먼저다: 저장소가 중단돼도 위험은 위험", () => {
  assert.equal(gradeFromOsv("1", [vuln("HIGH")], repo({ status: "deprecated" })).grade, "danger");
});

test("못 찾음이 쌓였으면 통과가 아니다(한 번 404), 주의도 아니다: 사라짐으로 확정되기 전까지는 찾지 못함", () => {
  assert.equal(gradeFromOsv("1", [], repo({ missedCount: 1 })).grade, "unknown");
});

test("미래 날짜는 신선하지 않다: 하루 뒤면 통과가 아니고, 몇 분 시계 어긋남은 봐준다", () => {
  assert.equal(gradeFromOsv("1", [], repo({ checkedAt: ago(-1) })).grade, "unknown");
  assert.equal(gradeFromOsv("1", [], repo({ activityAt: ago(-1) })).grade, "unknown");
  assert.equal(gradeFromOsv("1", [], repo({ checkedAt: ago(0) })).grade, "pass"); // 지금과 같은 시각은 통과
  assert.equal(gradeFromOsv("1", [], repo({ activityAt: ago(-1 / 24 / 60) })).grade, "pass"); // 1분 뒤: GitHub·서버 시계 어긋남
});

test("저장소를 읽은 적이 없거나(null) 날짜가 깨졌으면 통과가 아니다", () => {
  assert.equal(gradeFromOsv("1", [], repo({ checkedAt: null })).grade, "unknown");
  assert.equal(gradeFromOsv("1", [], repo({ activityAt: null })).grade, "unknown");
  assert.equal(gradeFromOsv("1", [], repo({ checkedAt: "어제" })).grade, "unknown");
  assert.equal(gradeFromOsv("1", [], repo({ activityAt: "not-a-date" })).grade, "unknown");
});
