"use client";
// 하단 패널 템플릿 탭(P-12e 조각 K, 서버는 조각 F): 틀(단계와 연결만) | 조합(단계와 기술). 지금 판을 템플릿으로 저장 · 내 템플릿 · 공개 템플릿.
// 내 것 · 공개 모두 "이 템플릿으로 시작" = /blueprint?template=id 로 새로 연다: studio가 지금 판 뒤에 펼치고(되돌리기 한 칸 = 지금 판) 확정에 templateId를 실어
// 쓰인 수 · 관문(남의 조합 기술)이 맞는다. 같은 화면 안 이동은 studio가 다시 펼치지 않아서 주소를 새로 연다(<a>).
// 같은 내용을 두 번 저장해도 한 줄(불변 3): templateSaveId. 실패하면 목록 · 판은 그대로(불변 4).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { asFrame, type TemplateKind } from "@/lib/blueprint/graph";
import { templateSaveId } from "@/lib/blueprint/panel-view";
import type { StoredBoard } from "@/lib/blueprint/stored";
import type { MyTemplate, PublicTemplate } from "@/lib/server/blueprint-templates";
import { saveTemplateAction, setTemplatePublicAction } from "./actions";
import type { PanelProps } from "./studio-types";
import { templatesAction, type TemplateLists } from "./template-actions";

const KIND_KO: Record<TemplateKind, string> = { frame: "틀", combo: "조합" };
const KIND_HINT: Record<TemplateKind, string> = { frame: "단계와 연결만", combo: "단계와 기술" };
const KIND_RO: Record<TemplateKind, string> = { frame: "틀로", combo: "조합으로" }; // 조사: 틀로 · 조합으로
const FAILED = "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
const flow = (b: StoredBoard) => b.map((c) => c.map((s) => s.name).join(" · ")).join(" → ");

export function TemplateTab({ graph, step, say }: PanelProps) {
  const [kind, setKind] = useState<TemplateKind>(step === 1 ? "frame" : "combo");
  useEffect(() => { if (step === 1) setKind("frame"); }, [step]); // ① 단계 구축에서는 틀부터
  const [lists, setLists] = useState<TemplateLists | { message: string } | undefined>(undefined); // undefined = 읽는 중
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => templatesAction().then(setLists, () => setLists({ message: "템플릿을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." })), []);
  useEffect(() => { void reload(); }, [reload]);

  async function save() {
    const body = kind === "frame" ? asFrame(graph) : graph;
    if (!body.stages.length) { say("단계가 있어야 템플릿으로 저장할 수 있어요."); return; }
    const sent = { kind, name: name.trim() }; // 기다리는 동안 이름 · 종류를 바꿔도 알림은 보낸 것으로
    setBusy(true);
    const r = await saveTemplateAction({ id: templateSaveId(sent.kind, sent.name, body), ...sent, graph: body }).catch(() => ({ ok: false as const, message: FAILED }));
    setBusy(false);
    if (!r.ok) { say(r.message); return; }
    say(`"${sent.name}"을(를) 내 ${KIND_RO[sent.kind]} 저장했어요. 처음엔 나만 봐요.`);
    void reload();
  }
  async function share(t: MyTemplate) {
    setBusy(true);
    const r = await setTemplatePublicAction(t.id, !t.isPublic).catch(() => ({ ok: false as const, message: FAILED }));
    setBusy(false);
    if (!r.ok) { say(r.message); return; }
    say(t.isPublic ? `"${t.name}"을(를) 비공개로 돌렸어요.` : `"${t.name}"을(를) 공개했어요. 갤러리에 별명과 함께 보여요.`);
    void reload();
  }

  return (
    <>
      <div className="dock-row" role="group" aria-label="템플릿 종류">
        {(["frame", "combo"] as TemplateKind[]).map((k) => (
          <button key={k} type="button" className="dock-tab" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_KO[k]} · {KIND_HINT[k]}</button>
        ))}
        <Link className="dock-link" href="/blueprint/gallery">갤러리에서 더 보기</Link>
      </div>
      <form className="dock-row" onSubmit={(e) => { e.preventDefault(); if (!busy) void save(); }}>
        <label>템플릿 이름 <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="예: 웹앱 기본 흐름" /></label>
        <button type="submit" className="btn dock-sm" aria-disabled={busy}>{busy ? "저장하는 중…" : `지금 판을 ${KIND_RO[kind]} 저장`}</button>
      </form>
      {kind === "frame" ? <p className="muted">틀은 기술을 빼고 단계와 연결만 저장해요.</p> : <p className="muted">조합은 단계에 붙인 기술까지 저장해요. 공개하면 다른 사람이 같은 조합으로 시작할 수 있어요.</p>}
      <p className="muted">&quot;이 템플릿으로 시작&quot;을 누르면 화면을 새로 열어 펼쳐요. 지금 판은 되돌리기 한 번으로 돌아와요.</p>
      {lists === undefined ? <p className="muted" role="status">템플릿을 읽는 중…</p>
        : "message" in lists ? <p className="notice notice-error" role="alert">{lists.message}</p>
        : <Lists lists={lists} kind={kind} busy={busy} onShare={(t) => void share(t)} />}
    </>
  );
}

/** 템플릿으로 새로 열기(같은 화면 안 이동이 아니라 주소를 새로 열어야 studio가 펼침). 지금 판은 되돌리기 한 칸 */
const Start = ({ t }: { t: MyTemplate | PublicTemplate }) => <a className="btn dock-sm" href={`/blueprint?template=${t.id}`}>이 템플릿으로 시작</a>;

function Lists({ lists, kind, busy, onShare }: { lists: TemplateLists; kind: TemplateKind; busy: boolean; onShare: (t: MyTemplate) => void }) {
  const mine = lists.mine?.filter((t) => t.kind === kind) ?? null;
  const open = lists.open[kind];
  return (
    <div className="dock-cols">
      <section aria-labelledby="tpl-mine">
        <h3 id="tpl-mine" className="dock-h">내 {KIND_KO[kind]} {mine ? <span className="muted">{mine.length}</span> : null}</h3>
        {mine === null ? <p className="notice notice-error" role="alert">내 템플릿을 불러오지 못했어요. 없다는 뜻이 아니에요.</p>
          : mine.length ? <ul className="dock-techs">{mine.map((t) => (
            <li key={t.id} className="dock-tech">
              <span><b>{t.name}</b><span className="muted"> · {t.hidden ? "관리자가 숨김" : t.isPublic ? "공개" : "나만 봄"}</span></span>
              <span className="muted">{flow(t.board)}</span>
              <span className="dock-row">
                <Start t={t} />
                {/* 관리자가 숨긴 것은 다시 공개할 수 없다(DB가 거절): 막힌 단추를 내지 않는다 */}
                {t.hidden && !t.isPublic ? <span className="muted">관리자가 숨겨서 공개할 수 없어요</span>
                  : <button type="button" className="btn dock-sm" aria-disabled={busy} onClick={() => { if (!busy) onShare(t); }}>{t.isPublic ? "비공개로" : "공개하기"}</button>}
              </span>
            </li>
          ))}</ul> : <p className="muted">아직 저장한 {KIND_KO[kind]}이 없어요. 위에서 지금 판을 저장해 보세요.</p>}
      </section>
      <section aria-labelledby="tpl-open">
        <h3 id="tpl-open" className="dock-h">공개 {KIND_KO[kind]} {open ? <span className="muted">{open.length}</span> : null}</h3>
        {open === null ? <p className="notice notice-error" role="alert">공개 템플릿을 불러오지 못했어요. 없다는 뜻이 아니에요.</p>
          : open.length ? <ul className="dock-techs">{open.map((t) => (
            <li key={t.id} className="dock-tech">
              <span><b>{t.name}</b><span className="muted"> · {t.authorNickname} · {t.uses}명이 씀</span></span>
              <span className="muted">{flow(t.board)}</span>
              <Start t={t} />
            </li>
          ))}</ul> : <p className="muted">아직 공개된 {KIND_KO[kind]}이 없어요.</p>}
      </section>
    </div>
  );
}
