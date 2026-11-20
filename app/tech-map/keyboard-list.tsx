"use client";
// 키보드·화면 읽기로 지도를 쓰는 목록(캔버스는 화면 읽기가 못 읽는다). 같은 묶음 나무를 단추 목록으로: 묶음은 펼치기/접기·만 보기, 기술은 자세히.
// 1,200개를 늘 그리지 않게 열었을 때만 만든다.
import { useState } from "react";
import type { Item, MapLayout } from "@/lib/map/layout";
import { GRADE_KO } from "@/lib/map/build-map";

type Props = { L: MapLayout; collapsed: Set<string>; onToggle: (id: string) => void; onOpen: (id: string) => void; onDrill: (id: string) => void; onFocus: (id: string) => void };

export function KeyboardList({ L, collapsed, onToggle, onOpen, onDrill, onFocus }: Props) {
  const [open, setOpen] = useState(false);
  const kids = new Map<string | null, Item[]>();
  if (open) for (const it of L.items) kids.set(it.parent, [...(kids.get(it.parent) ?? []), it]);
  const li = (it: Item) => it.type === "g" ? (
    <li key={it.id}>
      <button type="button" aria-expanded={!collapsed.has(it.id)} onClick={() => onToggle(it.id)} onFocus={() => onFocus(it.id)} onBlur={() => onFocus("")}>
        {collapsed.has(it.id) ? "▸" : "▾"} {it.value} ({it.count}{it.danger ? ` · 위험 ${it.danger}` : ""})</button>{" "}
      <button type="button" onClick={() => onDrill(it.id)} aria-label={`${it.value}만 보기`}>만 보기</button>
      {collapsed.has(it.id) ? null : <ul>{(kids.get(it.id) ?? []).map(li)}</ul>}
    </li>
  ) : (
    <li key={it.id}><button type="button" onClick={() => onOpen(it.id)} onFocus={() => onFocus(it.id)} onBlur={() => onFocus("")}>
      {it.node.name}{it.node.grade === "danger" || it.node.grade === "caution" ? ` · ${GRADE_KO[it.node.grade]}` : ""}{it.node.collectErrorKind ? " · 수집 오류" : ""}</button></li>
  );
  return (
    <details className="map-klist" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>목록으로 보기(키보드·화면 읽기)</summary>
      {open ? <><p className="muted">Enter: 묶음은 펼치기/접기, 기술은 자세히</p><ul>{(kids.get(null) ?? []).map(li)}</ul></> : null}
    </details>
  );
}
