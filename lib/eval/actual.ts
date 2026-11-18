// 정답 사례 하나의 실제 결과를 앱의 등급 규칙(P-10의 gradeFromOsv·scanRiskPatterns)으로 낸다.
// 파일 읽기는 주입받는다(시험은 가짜 파일, 스크립트는 실제 파일).
import { forPackage, gradeFromOsv, type OsvVuln } from "../domain/grade.ts";
import { gradeFromScan, scanRiskPatterns, type SourceFile } from "../domain/risk-patterns.ts";
import type { Actual, GoldCase } from "./score.ts";

export type Reader = {
  readJson: (path: string) => unknown;
  /** 폴더 안 모든 파일(하위 폴더 포함). path는 폴더 기준 상대 경로, `/` 구분 */
  readDir: (dir: string) => SourceFile[];
};

type Batch = { results: { name: string; version: string; vulns: OsvVuln[] }[] };

function osvResult(c: GoldCase, read: Reader): Omit<Actual, "id"> {
  if (c.input.type === "skill") throw new Error("스킬 사례는 OSV로 채점하지 않는다");
  const pkg = c.input.package;
  if (c.input.type === "osv") {
    const vulns = (read.readJson(c.input.fixture) as { vulns?: OsvVuln[] }).vulns ?? [];
    const r = gradeFromOsv(c.version, forPackage(vulns, pkg));
    return { grade: r.grade, event: r.grade === "danger", causeId: r.causeId };
  }
  const found = (read.readJson(c.input.fixture) as Batch).results.find((x) => x.name === pkg);
  if (!found) throw new Error(`조회 결과에 ${pkg}가 없음`);
  const r = gradeFromOsv(found.version, forPackage(found.vulns, pkg));
  return { grade: r.grade, event: r.grade === "danger", causeId: r.causeId };
}

function skillResult(c: GoldCase, read: Reader): Omit<Actual, "id"> {
  if (c.input.type !== "skill") throw new Error("OSV 사례는 스킬 검사로 채점하지 않는다");
  const files = read.readDir(c.input.dir);
  const r = gradeFromScan(scanRiskPatterns(files), files.length);
  return { grade: r.grade, event: r.grade === "danger", causeId: null };
}

/** 한 사례가 실패해도 다른 사례는 계속 채점한다. 실패는 error로 남겨 결과 표에 보인다. */
export function computeActual(c: GoldCase, read: Reader): Actual {
  try {
    const r = c.input.type === "skill" ? skillResult(c, read) : osvResult(c, read);
    return { id: c.id, ...r };
  } catch (e) {
    return { id: c.id, grade: "unknown", event: false, causeId: null, error: e instanceof Error ? e.message : String(e) };
  }
}
