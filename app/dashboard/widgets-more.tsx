// 프로젝트 관리 타공보드 판 ② 지도 · 소식 · ③ 청사진 · ④ 직접 추가(P-12k K1). 각자 데이터를 기다리고(Suspense = 읽는 중) 못 읽으면 "읽지 못함", 비었으면 "없음"(불변 2).
import Link from "next/link";
import { toAlertView, type AlertRecord } from "@/lib/alerts/to-alert-view";
import { changeCount } from "@/lib/dashboard/change-count";
import type { Trending } from "@/lib/domain/trending";
import type { CatalogHit } from "@/lib/server/my-tech";
import type { MoveProgress } from "@/lib/server/board-queries";
import type { NewsFeedResult } from "@/lib/server/news-feed";
import type { StatusData } from "@/lib/server/status-queries";
import { AddTech } from "../projects/add-tech";
import { DraftResume } from "./board-client";
import { Empty, Failed, short } from "./widgets";

const LINES = 3; // 판 안 목록은 갈래마다 세 줄
const When = ({ iso }: { iso: string }) => <time className="muted" dateTime={iso}>{short.format(new Date(iso))}</time>;

/** ② 지도 · 소식: 머리(오늘의 새 기술 · 바뀐 것 n = 띠 [기간]의 알림 목록 수(안내서 필수 "변경 수", K4) · 지도 열기) + 내 항목에 생긴 변경(위험 · 적용 기회 · 모델 종료) · 요즘 뜨는 것 · 공식 소식, 한 줄씩 출처 글자.
 *  alerts = null: 로그인 전(내 항목 칸 없음). feed "preview" = 미리보기(DB를 안 부름) */
export async function RadarBody({ newToday, alerts, trend, feed, period }: { newToday: Promise<number | null>; alerts: Promise<AlertRecord[] | null> | null; period: string;
  trend: Promise<{ items: Trending[] } | null>; feed: Promise<NewsFeedResult | null | "preview"> | NewsFeedResult | null }) {
  const [nt, al, tr, fd] = await Promise.all([newToday, alerts, trend, feed]);
  const recent = al ? [...al].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, LINES) : null;
  const news = fd && fd !== "preview" ? fd.items.filter((n) => n.kind === "external" || n.kind === "official_new").slice(0, LINES) : [];
  return (
    <>
      <p className="board-head">오늘의 새 기술 {nt === null ? <span className="board-warn">— 읽지 못함</span> : <b>{nt}</b>} · {alerts === null ? null : <ChangeHead alerts={al} period={period} />}<Link href="/?t=day">지도 열기</Link></p>
      {alerts === null ? null : <>
        <h3>내 항목의 변경</h3>
        {!recent ? <Failed what="내 항목의 변경" /> : recent.length ? <ul className="board-lines">{recent.map((r) => { const a = toAlertView(r); return (
          <li key={a.id}><span className="board-src">{a.kindLabel}</span><Link href={`/alerts/${a.id}`}>{a.title}</Link><When iso={a.createdAt} /></li>
        ); })}</ul> : <Empty>새로 바뀐 것이 없어요.</Empty>}
      </>}
      <h3>요즘 뜨는 것</h3>
      {!tr ? <Failed what="요즘 뜨는 것" /> : tr.items.length ? <ul className="board-lines">{tr.items.slice(0, LINES).map((x) => (
        <li key={x.id}><span className="board-src">{x.reasons.map((r) => (r.kind === "stars" ? `별 +${r.gain}` : `HN ${r.points}점`)).join(" · ")}</span><Link href={`/?sel=${encodeURIComponent(`tech:${x.id}`)}`}>{x.name}</Link></li>
      ))}</ul> : <Empty>최근 7일에 뜬 기술이 없어요.</Empty>}
      <h3>공식 소식</h3>
      {fd === "preview" ? <Empty>미리보기(개발용)에서는 소식을 읽지 않아요.</Empty> : !fd ? <Failed what="공식 소식" /> : <>
        {fd.failed.length ? <p className="board-fail" role="alert">— 읽지 못한 출처: {fd.failed.join(", ")}. 그 소식이 없다는 뜻이 아니에요.</p> : null}
        {news.length ? <ul className="board-lines">{news.map((n) => (
          <li key={n.id}><span className="board-src">{n.source}</span><a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}<span className="sr-only">(새 창)</span></a><When iso={n.publishedAt} /></li>
        ))}</ul> : fd.failed.length ? null : <Empty>최근 30일 공식 소식이 없어요.</Empty>}
      </>}
    </>
  );
}

/** 머리 "바뀐 것 n": 누르면 같은 기간의 알림 목록. 못 읽으면 "— 읽지 못함"(0과 다르게, 불변 2) */
function ChangeHead({ alerts, period }: { alerts: AlertRecord[] | null; period: string }) {
  const c = changeCount(alerts, period, new Date());
  return <>{c.n === null ? <>바뀐 것 <span className="board-warn">— 읽지 못함</span></> : <Link href={c.href}>바뀐 것 <b>{c.n}</b></Link>} · </>;
}

/** ③ 청사진: 담은 기술 → 확정한 청사진(최근 3, 레포 이름) → 청사진 열기, 이 브라우저에 초안이 있으면 "이어서 하기". move = null: 로그인 전 */
export async function BlueprintBody({ move, status, who }: { move: Promise<MoveProgress | null> | null; status: Promise<StatusData | null> | null; who: string }) {
  const [m, st] = await Promise.all([move, status]);
  const names = new Map((st?.projects ?? []).map((p) => [p.id, p.name]));
  const open = <p className="board-actions"><Link className="btn btn-sm" href="/blueprint">청사진 열기</Link><DraftResume who={who} /></p>;
  if (move === null) return <><Empty>지도에서 &quot;청사진에 담기&quot;로 고른 기술로 청사진을 짜요. 로그인하면 확정한 청사진이 여기에 남아요.</Empty>{open}</>;
  if (!m) return <><Failed what="청사진" />{open}</>;
  return (
    <>
      <p className="board-head"><Link href="/blueprint">담은 기술 <b>{m.candidates}</b></Link></p>
      <h3>확정한 청사진</h3>
      {m.blueprints.length ? <ul className="board-lines">{m.blueprints.slice(0, LINES).map((b) => (
        <li key={b.id}><span className="board-src">{b.projectId ? names.get(b.projectId) ?? (st ? "보관한 레포" : "레포 모름") : "레포 없이"}</span><span>{b.name}</span><When iso={b.createdAt} /></li>
      ))}</ul> : <Empty>아직 확정한 청사진이 없어요.</Empty>}
      {open}
    </>
  );
}

/** ④ 직접 추가(안내서 필수 "직접 입력", IA-3 · PRD-F7): 모은 기술에서 찾아 고르거나 이름만 넣고 넣을 레포를 고른다. hits "failed" = 검색 실패 */
export async function AddBody({ status, q, hits }: { status: Promise<StatusData | null>; q: string; hits: Promise<CatalogHit[] | null | "failed"> }) {
  const [st, h] = await Promise.all([status, hits]);
  if (!st) return <Failed what="넣을 레포 목록" />;
  return <AddTech projects={st.projects} q={q} hits={h === "failed" ? null : h} searchFailed={h === "failed"} back="" carry="" />;
}
