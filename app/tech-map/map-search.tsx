"use client";
// 지도 찾기 칸 하나로 찾기 · 넣기(11-21 사용자 결정): ① 지도에 올린 기술 · 분류 → ② 없으면 모은 기술 전체(카탈로그)에서 찾아 지도에 올리기
// → ③ 거기에도 없으면(고유명사 등) "'이름' 직접 추가"로 내 기술에 넣기. 지도에 올리기 · 추가 뒤에는 그 기술을 고른 채로 지도를 새로 연다.
import { useEffect, useState } from "react";
import { searchTerm } from "@/lib/domain/my-tech-view";
import { UNSORTED } from "@/lib/map/build-map";
import type { Dim } from "@/lib/map/view-config";
import type { PoolTech } from "@/lib/server/blueprints";
import { LoginLink } from "../login-link";
import { addMapTechAction, searchCatalogAction } from "./actions";

/** 프로젝트 밖 칸 이름(lib/server/local-import.ts LOCAL_PROJECT_NAME과 같은 글자: 서버 모듈이라 화면에서 부르지 않음). 이미 있으면 목록에 한 번만 */
const LOCAL_NAME = "내 컴퓨터(프로젝트 밖)";

export type FindHit = { key?: string; scope?: { dim: Dim; value: string }; label: string; sub: string };
type Props = { onFind: (q: string) => FindHit[]; onPick: (hit: FindHit) => void; login: boolean; projects: { id: string; name: string }[] };

/** 고른 기술을 연 채로 지도를 다시 연다(지도 위 보기 설정은 주소에 있어 그대로). 새 모델을 읽어야 해 화면 안 이동이 아니라 새로 연다 */
function openOnMap(key: string) {
  const p = new URLSearchParams(location.search);
  p.set("sel", key);
  location.assign(`/?${p}`);
}

export function MapSearch({ onFind, onPick, login, projects }: Props) {
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState<PoolTech[] | null | undefined>(undefined); // undefined = 안 찾음, null = 찾기 실패
  const term = q.trim(), server = searchTerm(q); // 서버와 같은 규칙(글자 · 숫자 두 개 이상, 기호는 뺌): 못 찾을 글자로 "없어요"라고 하지 않게
  const local = term ? onFind(q) : [];
  useEffect(() => { // 지도에 없을 때만 0.4초 뒤 카탈로그에서
    setCatalog(undefined);
    if (!server || local.length) return;
    let live = true;
    const t = setTimeout(() => searchCatalogAction(server).then((r) => { if (live) setCatalog(r); }, () => { if (live) setCatalog(null); }), 400);
    return () => { live = false; clearTimeout(t); };
  }, [server, local.length]);
  const pick = (hit: FindHit) => { setQ(""); onPick(hit); };
  return (
    <div className="map-search" role="search">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="기술 찾기 · 넣기" aria-label="기술이나 분류 찾기, 없으면 넣기"
        onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
      {term ? (
        <ul className="map-results">
          {local.map((r) => <li key={r.key ?? `${r.scope!.dim}:${r.scope!.value}`}><button type="button" onClick={() => pick(r)}>{r.label} <span className="muted">{r.sub}</span></button></li>)}
          {local.length ? null : <CatalogPart term={term} searchable={!!server} catalog={catalog} login={login} projects={projects} />}
        </ul>
      ) : null}
    </div>
  );
}

function CatalogPart({ term, searchable, catalog, login, projects }: { term: string; searchable: boolean; catalog: PoolTech[] | null | undefined; login: boolean; projects: { id: string; name: string }[] }) {
  if (!searchable) return <li className="muted">지도에 없어요. 모은 기술 전체에서 찾으려면 글자나 숫자를 두 개 이상 써 주세요(기호는 빼고 찾아요).</li>;
  if (catalog === undefined) return <li className="muted" role="status">지도에 없어서 모은 기술 전체에서 찾는 중…</li>;
  if (catalog === null) return <li className="muted" role="alert">찾지 못했어요. 없다는 뜻이 아니에요. 잠시 뒤 다시 찾아 주세요.</li>;
  return (
    <>
      {catalog.map((t) => (
        <li key={t.id}><button type="button" onClick={() => openOnMap(`tech:${t.id}`)}>{t.name} <span className="muted">{t.field ?? UNSORTED} · 지도에 올리기</span></button></li>
      ))}
      {catalog.length ? null : <><li className="muted">모은 기술에서도 찾지 못했어요.</li><ManualAdd name={term} login={login} projects={projects} /></>}
    </>
  );
}

/** 카탈로그에도 없으면: 이름 그대로 내 기술에 추가(프로젝트 고르기). 로그인 전에는 로그인으로 */
function ManualAdd({ name, login, projects }: { name: string; login: boolean; projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "local");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!login) return <li className="map-add"><LoginLink>로그인하고 ‘{name}’ 직접 추가</LoginLink></li>;
  if (!open) return <li className="map-add"><button type="button" onClick={() => setOpen(true)}>+ ‘{name}’ 직접 추가</button></li>;
  const add = async () => {
    setBusy(true); setMsg("");
    const r = await addMapTechAction(name, projectId).catch(() => ({ ok: false as const, message: "추가하지 못했어요. 잠시 뒤 다시 해 주세요." }));
    setBusy(false);
    if (r.ok) openOnMap(`name:${name.toLowerCase()}`); else setMsg(r.message);
  };
  return (
    <li className="map-add">
      <label>‘{name}’을(를) 넣을 곳 <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        {projects.some((p) => p.name === LOCAL_NAME) ? null : <option value="local">{LOCAL_NAME}</option>}
      </select></label>
      <button type="button" className="btn btn-primary" aria-disabled={busy} onClick={() => { if (!busy) void add(); }}>{busy ? "추가하는 중…" : "추가"}</button>
      {msg ? <span role="alert" className="map-add-error">{msg}</span> : null}
    </li>
  );
}
