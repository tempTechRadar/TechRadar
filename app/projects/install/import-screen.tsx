"use client";
// 내 컴퓨터 목록 가져오기(PRD-F33): 가져오기 글 복사 → 결과 붙여 넣기 → 미리보기 → 저장("프로젝트 밖").
// 미리보기는 화면에서, 저장할 때는 서버가 같은 규칙으로 다시 읽는다. 실패해도 붙여 넣은 글은 그대로 남는다.
import { useActionState, useMemo, useState } from "react";
import { IMPORT_PROMPT } from "@/lib/install/import-prompt";
import { parseImportLines } from "@/lib/install/parse-import-lines";
import { saveImportAction, type ImportState } from "./actions";

export function ImportScreen() {
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState<ImportState, FormData>(saveImportAction, null);
  const [copied, setCopied] = useState(false);
  const preview = useMemo(() => parseImportLines(text), [text]);

  return (
    <section aria-labelledby="import-h" style={{ marginTop: 32 }}>
      <h2 id="import-h">② 내 컴퓨터 목록 가져오기</h2>
      <p>1. 아래 글을 복사해 내 컴퓨터의 Claude Code에 붙여 넣으세요.</p>
      <pre style={{ whiteSpace: "pre-wrap", background: "var(--sunken)", border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>{IMPORT_PROMPT}</pre>
      <button type="button" style={{ minHeight: 44 }} onClick={() => navigator.clipboard.writeText(IMPORT_PROMPT).then(() => setCopied(true), () => setCopied(false))}>가져오기 글 복사</button>
      {copied ? <span role="status"> 복사했어요.</span> : null}
      <form action={action}>
        <p><label htmlFor="import-text">2. Claude가 출력한 줄을 여기에 붙여 넣으세요.</label></p>
        <textarea id="import-text" name="text" value={text} onChange={(e) => setText(e.target.value)} rows={8} style={{ width: "100%", fontFamily: "monospace" }} />
        <h3 style={{ fontSize: 16 }}>미리보기</h3>
        <p>받을 것 {preview.items.length}줄 · 형식이 맞지 않아 뺀 것 {preview.skipped.length}줄 · 비밀값처럼 보여서 뺀 것 {preview.secretLines.length}줄</p>
        {preview.items.length > 0 ? (
          <ul>{preview.items.map((i) => <li key={`${i.kind}|${i.name}|${i.pkg}|${i.version ?? ""}`}>{i.kind} · {i.name} · {i.ecosystem ? `${i.ecosystem} ` : ""}{i.pkg}{i.version ? `@${i.version}` : ""}</li>)}</ul>
        ) : null}
        {preview.skipped.length > 0 ? <ul style={{ color: "var(--muted)" }}>{preview.skipped.map((s) => <li key={s.line}>{s.line}째 줄: {s.reason}</li>)}</ul> : null}
        {preview.secretLines.length > 0 ? <p role="alert" style={{ color: "var(--ink-danger)" }}>{preview.secretLines.join(", ")}째 줄은 비밀값처럼 보여서 뺐어요(저장하지 않아요).</p> : null}
        <button type="submit" disabled={pending || preview.items.length === 0} style={{ minHeight: 44 }}>3. 확인하고 &quot;프로젝트 밖&quot;에 저장</button>
      </form>
      {state ? (
        state.ok
          ? <p role="status">저장했어요: {state.saved}개{state.alreadyThere ? ` (이미 있던 ${state.alreadyThere}개는 그대로)` : ""}.</p>
          : <p role="alert" style={{ color: "var(--ink-danger)" }}>{state.message} 붙여 넣은 글은 그대로 두었어요.</p>
      ) : null}
    </section>
  );
}
