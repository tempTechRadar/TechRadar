"use client";
// 지도 찾기 칸(11-21 사용자 결정): ① 지도에 올린 기술 · 분류 → ② 없으면 모은 기술 전체(카탈로그)에서 찾아 지도에 올리기(그 기술을 고른 채로 지도를 새로 연다).
// 카탈로그에도 없을 때의 "직접 추가"는 뺐다(P-12k 사용자: 찾기 · 넣기는 앱에서 지우고 나중에 커스텀 기술 추가로). 직접 입력은 프로젝트 보드의 직접 추가 판에.
import { useEffect, useState } from "react";
import { searchTerm } from "@/lib/domain/my-tech-view";
import { UNSORTED } from "@/lib/map/build-map";
import type { Dim } from "@/lib/map/view-config";
import type { PoolTech } from "@/lib/server/blueprints";
import { searchCatalogAction } from "./actions";

export type FindHit = { key?: string; scope?: { dim: Dim; value: string }; label: string; sub: string };
type Props = { onFind: (q: string) => FindHit[]; onPick: (hit: FindHit) => void };

/** 고른 기술을 연 채로 지도를 다시 연다(지도 위 보기 설정은 주소에 있어 그대로). 새 모델을 읽어야 해 화면 안 이동이 아니라 새로 연다 */
function openOnMap(key: string) {
  const p = new URLSearchParams(location.search);
  p.set("sel", key);
  location.assign(`/?${p}`);
}

export function MapSearch({ onFind, onPick }: Props) {
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
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="기술 찾기" aria-label="기술이나 분류 찾기"
        onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
      {term ? (
        <ul className="map-results">
          {local.map((r) => <li key={r.key ?? `${r.scope!.dim}:${r.scope!.value}`}><button type="button" onClick={() => pick(r)}>{r.label} <span className="muted">{r.sub}</span></button></li>)}
          {local.length ? null : <CatalogPart searchable={!!server} catalog={catalog} />}
        </ul>
      ) : null}
    </div>
  );
}

function CatalogPart({ searchable, catalog }: { searchable: boolean; catalog: PoolTech[] | null | undefined }) {
  if (!searchable) return <li className="muted">지도에 없어요. 모은 기술 전체에서 찾으려면 글자나 숫자를 두 개 이상 써 주세요(기호는 빼고 찾아요).</li>;
  if (catalog === undefined) return <li className="muted" role="status">지도에 없어서 모은 기술 전체에서 찾는 중…</li>;
  if (catalog === null) return <li className="muted" role="alert">찾지 못했어요. 없다는 뜻이 아니에요. 잠시 뒤 다시 찾아 주세요.</li>;
  return (
    <>
      {catalog.map((t) => (
        <li key={t.id}><button type="button" onClick={() => openOnMap(`tech:${t.id}`)}>{t.name} <span className="muted">{t.field ?? UNSORTED} · 지도에 올리기</span></button></li>
      ))}
      {catalog.length ? null : <li className="muted">모은 기술에서도 찾지 못했어요.</li>}
    </>
  );
}
