"use client";
// 블루프린트 화면 상태: 판 · 이름 · 고른 단계 · 서랍 탭 · 대화상자. 만드는 중인 판은 이 브라우저 · 이 계정에만 저장(편의 기억, 못 쓰면 새로 고칠 때 사라질 뿐).
// 빼기 · 템플릿 · 불러오기 · 인터뷰 · 끌어 옮기기는 알림의 "되돌리기"로 전 판을 되살린다. 알림 없는 바꾸기가 뒤따르면 옛 되돌리기는 지운다(그 바꾸기까지 지우지 않게).
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { find, fromNames, putTech, MAX_TECHS, type Board } from "@/lib/blueprint/board";
import { TEMPLATES } from "@/lib/blueprint/knowledge";
import { parseBoard, toBoard, toStored, usageOf, type BlueprintRecord, type StoredBoard } from "@/lib/blueprint/stored";
import type { BlueprintPage, PoolTech } from "@/lib/server/blueprints";
import { ToastLine, useToast, type Say } from "../undo-toast";
import { confirmAction } from "./actions";
import { ConfirmDialog, ExportDialog, InterviewDialog, TemplateDialog, type DialogKind } from "./dialogs";
import { Drawer, type Tab } from "./drawer";
import { Lanes, type Change, type DragTech } from "./lanes";

type Draft = { name: string; board: StoredBoard };
function readDraft(key: string): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? "null") as Draft | null;
    return d && typeof d.name === "string" && parseBoard(d.board).ok ? d : null;
  } catch { return null; }
}

/** 판 · 이름을 이 브라우저에 두고 다시 불러온다. 서버 그림과 맞추려 처음엔 null, 브라우저에서 초안 또는 기본 템플릿으로 */
function useDraft(key: string) {
  const [board, setBoard] = useState<Board | null>(null);
  const [name, setName] = useState("내 블루프린트");
  useEffect(() => {
    const d = readDraft(key);
    setBoard(d ? toBoard(d.board) : fromNames(TEMPLATES[0].cols));
    if (d) setName(d.name);
  }, [key]);
  useEffect(() => {
    if (!board) return;
    try { localStorage.setItem(key, JSON.stringify({ name, board: toStored(board) })); } catch { /* 저장을 막은 브라우저: 이번 화면에서만 */ }
  }, [key, board, name]);
  return { board, setBoard, name, setName };
}

/** 이 조합으로 확정: 확정 id는 내용(이름 · 프로젝트 · 판)마다 하나 — 같은 내용을 다시 누르거나 실패 뒤 다시 열어 눌러도 한 줄(불변 3) */
function useConfirm(onDone: () => void) {
  const last = useRef({ key: "", id: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = async (name: string, projectId: string | null, board: Board) => {
    const stored = toStored(board), key = JSON.stringify([name, projectId, stored]);
    if (key !== last.current.key) last.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError("");
    const r = await confirmAction({ id: last.current.id, name, projectId, board: stored }).catch(() => ({ ok: false as const, message: "확정하지 못했어요. 판은 그대로 있어요. 잠시 뒤 다시 시도해 주세요." }));
    setBusy(false);
    if (r.ok) onDone(); else setError(r.message);
  };
  return { confirm, busy, error, reset: () => setError("") };
}

/** 기술 붙이기 전 확인(위험 등급 · 이미 있음 · 개수). 붙일 수 있으면 새 판, 아니면 이유를 알리고 null */
function withTech(board: Board, stageId: string, t: DragTech | PoolTech, say: Say): Board | null {
  const s = find(board, stageId)?.s;
  if (!s) return null;
  if (t.grade === "danger") { say("위험 등급 기술은 블루프린트에 넣지 않아요."); return null; }
  if (s.techs.some((x) => x.id === t.id)) { say(`${s.name}에 이미 있어요.`); return null; }
  if (s.techs.length >= MAX_TECHS) { say(`한 단계에 기술은 ${MAX_TECHS}개까지예요.`); return null; }
  return putTech(board, stageId, { id: t.id, name: t.name });
}

export function BlueprintApp({ who, pool, history, projects }: BlueprintPage & { who: string }) {
  const router = useRouter();
  const { board, setBoard, name, setName } = useDraft(`techradar-blueprint:${who}`);
  const [focus, setFocus] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("tech");
  const [dlg, setDlg] = useState<DialogKind | null>(null);
  const { toast, say, clear } = useToast();
  const usage = useMemo(() => usageOf(history ?? []), [history]);
  const done = useConfirm(() => { setDlg(null); setTab("hist"); say("확정해서 내 이력에 남겼어요. 붙인 기술의 쓴 횟수에 더해져요."); router.refresh(); });
  if (!board) return <p className="muted bp-wait">판을 준비하는 중…</p>;

  const change: Change = (next, message, undoable) => {
    if (next === board) return;
    const prev = board;
    setBoard(next);
    if (message) say(message, undoable ? () => { setBoard(prev); say("되돌렸어요."); } : undefined);
    else clear();
  };
  const put = (stageId: string, t: DragTech | PoolTech) => { const next = withTech(board, stageId, t, say); if (next) change(next, `${find(next, stageId)!.s.name}에 ${t.name} 붙였어요.`); };
  const replace = (cols: string[][], message: string) => { setFocus(null); setDlg(null); change(fromNames(cols), message, true); };
  const load = (h: BlueprintRecord) => {
    const prev = { board, name };
    setFocus(null); setBoard(toBoard(h.board)); setName(h.name);
    say(`"${h.name}"을(를) 불러왔어요.`, () => { setBoard(prev.board); setName(prev.name); say("되돌렸어요."); });
  };
  const title = name.trim() || "이름 없는 블루프린트";

  return (
    <>
      <div className="bp-bar">
        <label className="sr-only" htmlFor="bp-name">블루프린트 이름</label>
        <input id="bp-name" className="bp-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <span className="bp-grow" />
        <button type="button" className="btn" onClick={() => setDlg("tpl")}>템플릿</button>
        <button type="button" className="btn" onClick={() => setDlg("iv")}>인터뷰로 만들기</button>
        <button type="button" className="btn" onClick={() => setDlg("export")}>내보내기</button>
        <button type="button" className="btn btn-primary" onClick={() => { done.reset(); setDlg("confirm"); }}>이 조합으로 확정</button>
      </div>
      <div className="bp-work">
        <Drawer tab={tab} onTab={setTab} pool={pool} usage={usage} history={history} focus={focus ? find(board, focus)?.s ?? null : null} onFocus={setFocus} onPut={(t) => focus && put(focus, t)} onLoad={load} />
        <div className="bp-canvas" role="region" aria-label="블루프린트 판. 왼쪽에서 오른쪽으로 순서, 같은 열은 동시에(나란히)">
          <Lanes board={board} focus={focus} onFocus={setFocus} change={change} dropTech={put} />
        </div>
      </div>
      <ToastLine toast={toast} clear={clear} className="bp-toast" />
      {dlg === "tpl" ? <TemplateDialog onClose={() => setDlg(null)} onPick={(cols, n) => replace(cols, `"${n}"으로 바꿨어요.`)} /> : null}
      {dlg === "iv" ? <InterviewDialog onClose={() => setDlg(null)} onMake={(cols) => replace(cols, "인터뷰 답으로 블루프린트를 만들었어요.")} /> : null}
      {dlg === "export" ? <ExportDialog name={title} board={board} onClose={() => setDlg(null)} say={say} /> : null}
      {dlg === "confirm" ? <ConfirmDialog name={title} board={board} projects={projects} busy={done.busy} error={done.error} onConfirm={(p) => void done.confirm(title, p, board)} onClose={() => setDlg(null)} /> : null}
    </>
  );
}
