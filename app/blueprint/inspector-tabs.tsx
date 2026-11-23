"use client";
// 속성 서랍의 기술 탭(P-12j H3): 개요 · 관계 · 검증 · 이력. 기술을 고르면 한 번 읽고(inspectorTechAction) 이 화면 동안 기억한다.
// 정직성 규칙 4: 근거가 있는 칸만 — 없으면 "정보 없음", 못 읽으면 "읽지 못했어요 · 없다는 뜻이 아니에요"(불변 2). 설명을 지어내지 않는다.
// 손님은 내 판단 이력 · 관문을 읽지 않고, 관문은 이 브라우저 담은 목록으로 본다.
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { linkEnd, removeLink } from "@/lib/blueprint/graph";
import { GRADE_KO } from "@/lib/map/build-map";
import { inspectorTechAction, type InspectorRead } from "./actions";
import type { PanelProps } from "./studio-types";
import { TYPE_KO } from "./tech-chip";
import { koOverview } from "@/lib/views/ko-overview";
import { KoOverviewText } from "../ko-overview";

type Tab = "info" | "rel" | "check" | "log";
const TABS: [Tab, string][] = [["info", "개요"], ["rel", "관계"], ["check", "검증"], ["log", "이력"]];
const MARK_KO = { interest: "관심", candidate: "적용 후보(담음)", hold: "보류" } as const;
const NONE = <span className="muted">정보 없음</span>;
const UNREAD = <p className="notice notice-error" role="alert">읽지 못했어요 · 없다는 뜻이 아니에요. 서랍을 닫았다 열면 다시 읽어요.</p>;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null);
/** 이 화면 동안 기술마다 한 번(관문이 바뀌면 = 담기 뒤 서랍을 다시 읽으면 key가 달라져 새로 읽음). 못 읽은 것은 기억하지 않는다 */
const cache = new Map<string, InspectorRead>();

function useInspectorTech(techId: string, key: string): InspectorRead | undefined {
  const [got, setGot] = useState<InspectorRead | undefined>(() => cache.get(key));
  useEffect(() => {
    const hit = cache.get(key);
    if (hit) { setGot(hit); return; }
    setGot(undefined);
    let live = true;
    inspectorTechAction(techId).then((r) => { if (r.ok) cache.set(key, r); if (live) setGot(r); }, () => { if (live) setGot({ ok: false }); });
    return () => { live = false; };
  }, [techId, key]);
  return got;
}

const Row = ({ k, children }: { k: string; children: ReactNode }) => <><dt>{k}</dt><dd>{children}</dd></>;

export function TechTabs(p: PanelProps & { techId: string; name: string }) {
  const { techId, graph, apply, guest, guestPicks, pool, onCandidate, marking, log = [] } = p;
  const [tab, setTab] = useState<Tab>("info");
  const inPool = pool.some((t) => t.id === techId);
  const got = useInspectorTech(techId, `${techId}:${inPool}:${guest ? "guest" : "user"}`); // 로그인 전에 읽은 것(내 판단 · 관문 없음)을 로그인 뒤 다시 쓰지 않게
  const tech = got?.ok ? got.tech : null;
  const ko = tech ? koOverview(tech.tech) : null;
  const stages = graph.stages.filter((s) => s.techs.some((t) => t.id === techId));
  const ends = new Set(stages.map((s) => linkEnd(techId, s.id)));
  const nameOf = (end: string) => { for (const s of graph.stages) for (const t of s.techs) if (linkEnd(t.id, s.id) === end) return `${t.name}(${s.name})`; return "이름 모름"; };
  const links = (graph.links ?? []).filter((l) => ends.has(l.from) || ends.has(l.to));
  const offBoard = stages.length === 0 && (tab === "rel" || tab === "log"); // 하단 패널에서 연 판 밖 기술(P-12t): 판의 관계 · 이력이 아직 없다
  const body = got === undefined ? <p className="muted" role="status">읽는 중…</p>
    : !got.ok ? (got.preview ? <p className="muted">미리보기(개발용)에서는 기술 정보를 읽지 않아요.</p> : UNREAD)
    : null;
  return (
    <section className="insp-tabs" aria-label={`${p.name} 자세히`}>
      <div className="dock-tabs" role="group" aria-label="기술 보기">
        {TABS.map(([k, label]) => <button key={k} type="button" className="dock-tab" aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {offBoard ? <p className="muted">판에 넣으면 보여요.</p> : tab === "rel" ? <>
        {/* 이 판의 관계선은 서버를 읽지 않아도 안다 */}
        <h3 className="dock-h">이 판에서 내가 그은 관계 {links.length}</h3>
        {links.length ? <ul className="insp-links">{links.map((l) => (
          <li key={`${l.from}>${l.to}`}>{nameOf(l.from)} → {nameOf(l.to)} <button type="button" className="btn btn-sm btn-danger" aria-label={`${nameOf(l.from)} → ${nameOf(l.to)} 관계 표시 지우기`}
            onClick={() => apply(removeLink(graph, l.from, l.to), `"${nameOf(l.from)} → ${nameOf(l.to)}" 관계 표시를 지웠어요.`)}>끊기</button></li>
        ))}</ul> : <p className="muted">없어요. 캔버스에서 기술의 점끼리 이으면 생겨요(내가 긋는 표시예요, 호환 검증이 아니에요).</p>}
        <h3 className="dock-h">지도 비교군</h3>
        {body ?? (tech?.peers.length ? <ul className="insp-links">{tech.peers.map((x) => (
          <li key={x.id}><Link href={`/tech/${x.id}`}>{x.name}</Link> <span className="muted">· 보안 {GRADE_KO[x.grade as keyof typeof GRADE_KO] ?? "정보 없음"}{x.quote ? ` · 왜: ${x.quote}` : ""}</span></li>
        ))}</ul> : <p className="muted">관리자가 확인한 비교군이 없어요.</p>)}
      </> : body ?? (!tech ? <p className="muted">카탈로그에서 이 기술을 찾지 못했어요(이름만 넣은 기술이거나 공개 목록 밖).</p>
        : tab === "info" ? (
          <dl className="side-facts">
            <Row k="설명">{ko ? <KoOverviewText v={ko} /> : tech.tech.oneLiner ?? NONE}</Row>
            <Row k="종류">{TYPE_KO[tech.tech.type] ?? tech.tech.type}</Row>
            <Row k="버전">{NONE}</Row>
            <Row k="출처">{tech.tech.isOfficial ? "공식" : "공식 표시 없음"}</Row>
            <Row k="저장소">{tech.tech.repoUrl ? <a href={tech.tech.repoUrl} target="_blank" rel="noopener noreferrer">저장소 열기</a> : NONE}</Row>
            <Row k="라이선스">{tech.tech.license ?? NONE}</Row>
            <Row k="배치 단계">{stages.length ? stages.map((s) => s.name).join(", ") : "이 판에 없음"}</Row>
          </dl>
        ) : tab === "check" ? (
          <dl className="side-facts">
            <Row k="등급">보안 {GRADE_KO[tech.tech.grade]}</Row>
            <Row k="이유">{tech.tech.gradeReason ?? NONE}</Row>
            <Row k="수집 오류">{tech.tech.collectErrorKind ? `있음(${tech.tech.collectErrorKind}) — 지난번 값이에요` : "없음"}</Row>
            <Row k="마지막 확인">{day(tech.tech.lastCheckedOkAt) ?? NONE}</Row>
            <Row k="관문">{guest ? (guestPicks?.ids.includes(techId) ? "이 브라우저에 담음" : "담지 않음 — 지도에서 \"청사진에 담기\"")
              : tech.gate === "in" ? "넣을 수 있어요(사용 중인 항목 · 담은 기술 · 내 이력)"
              : <>아직 담지 않은 기술 <button type="button" className="btn btn-sm" disabled={marking === techId} onClick={() => onCandidate(techId, p.name)}>{marking === techId ? "담는 중…" : "청사진에 담기"}</button></>}</Row>
          </dl>
        ) : <>
          <h3 className="dock-h">내 판단 이력</h3>
          {guest ? <p className="muted">로그인하면 보여요.</p> : tech.events.length ? <ul className="insp-links">{tech.events.map((e, i) => (
            <li key={i}>{day(e.at)} · {e.status ? MARK_KO[e.status] : "판단 지움"}{e.reason ? ` · ${e.reason}` : ""}</li>
          ))}</ul> : <p className="muted">아직 없어요.</p>}
          <h3 className="dock-h">이 판에서 바꾼 일</h3>
          <LogList log={log.filter((m) => m.includes(p.name))} />
        </>)}
    </section>
  );
}

const LogList = ({ log }: { log: string[] }) => (log.length ? <ul className="insp-links">{[...log].reverse().map((m, i) => <li key={i}>{m}</li>)}</ul>
  : <p className="muted">이 화면에서 이 기술로 바꾼 일이 없어요(되돌린 것도 남아요).</p>);
