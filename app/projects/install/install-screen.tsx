"use client";
// 설치 프롬프트 만들기(PRD-F25): 고르기 → 미리보기 → 복사. 글은 정해진 틀(buildInstallPrompt)로만 만든다. AI가 쓰지 않는다.
import { useMemo, useState } from "react";
import { buildInstallPrompt } from "@/lib/install/build-install-prompt";
import { toInstallItems, type MyTechRow } from "@/lib/install/from-my-tech";
import { recordPromptCopy } from "./actions";

const GRADE_KO: Record<MyTechRow["grade"], string> = { pass: "통과", caution: "주의", danger: "위험", unknown: "찾지 못함" };
const label = (r: MyTechRow) => r.technologies?.tech_key ?? "(이름만 쓴 기술)";
const flip = (set: Set<string>, id: string) => {
  const n = new Set(set);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
};

export function InstallScreen({ rows, pins }: { rows: MyTechRow[]; pins: [string, string][] }) {
  // 기본: 모두 고름. 위험은 어떤 경우에도 프롬프트에 들어가지 않는다(ADR 0012)
  const [picked, setPicked] = useState(() => new Set(rows.map((r) => r.id)));
  const [copied, setCopied] = useState<string | null>(null);
  const pinned = useMemo(() => new Map(pins), [pins]);
  const result = useMemo(() => {
    const { items, notIncluded } = toInstallItems(rows.filter((r) => picked.has(r.id)), pinned);
    return { ...buildInstallPrompt(items), notIncluded };
  }, [rows, picked, pinned]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied("복사했어요. 다른 컴퓨터의 Claude Code에 붙여 넣으세요.");
      const excludedDanger = rows.filter((r) => picked.has(r.id) && r.grade === "danger" && !pinned.has(r.id)).length;
      void recordPromptCopy({ tech: result.includedCount, excludedDanger }).catch(() => {});
    } catch {
      setCopied("복사하지 못했어요. 아래 글을 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <section aria-labelledby="install-h">
      <h2 id="install-h">① 설치 프롬프트 만들기</h2>
      <p>옮길 기술을 고르면 다른 컴퓨터의 Claude Code에 붙여 넣을 글이 만들어져요. 위험 등급은 기본으로 빠지고 이유와 고친 버전이 따로 적혀요.</p>
      {rows.length === 0 ? <p>아직 사용 중인 항목이 없어요. 프로젝트를 등록하거나 아래에서 가져오기를 해 주세요.</p> : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {rows.map((r) => (
            <li key={r.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", minHeight: 44 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked(flip(picked, r.id))} style={{ width: 22, height: 22 }} />
                {label(r)}{r.version ? `@${r.version}` : ""} · {GRADE_KO[r.grade]}{pinned.has(r.id) ? ` → ${pinned.get(r.id)}로 고정` : ""}
              </label>
              {r.grade === "danger" && !pinned.has(r.id) && picked.has(r.id) ? (
                <span style={{ color: "var(--ink-danger)" }}>위험이라 프롬프트에 넣지 않아요</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {result.notIncluded.length > 0 ? <p style={{ fontSize: 14, color: "var(--muted)" }}>넣지 못한 것 {result.notIncluded.length}개: 직접 이름만 쓴 기술이나 패키지 이름이 없는 기술이에요.</p> : null}
      <p>넣은 것 {result.includedCount}개 · 값 검사에서 뺀 것 {result.excluded.length}개</p>
      <pre aria-label="설치 프롬프트 미리보기" style={{ whiteSpace: "pre-wrap", background: "var(--sunken)", border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>{result.text}</pre>
      <button type="button" onClick={copy} style={{ minHeight: 44 }}>복사하기</button>
      {copied ? <p role="status">{copied}</p> : null}
    </section>
  );
}
