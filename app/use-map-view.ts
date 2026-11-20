"use client";
// 지도 보기 설정(묶기·색·거르기)을 주소와 이 브라우저에 남기고 되살린다. 브라우저 저장은 로그인했을 때만(design.md 14절 저장 규칙):
// 로그인 전 보기는 누구에게나 같은 지도라 주소로만 나눈다. 이 화면에서 못 쓰는 거르기(프로젝트 없는 지도의 "내 기술만"·없는 프로젝트)는
// 버린다: 남겨 두면 고칠 단추도 없이 지도가 비어 "기술이 없음"과 "거르기에 걸림"을 구분할 수 없다.
import { useEffect, useMemo, useState } from "react";
import type { TechMapModel } from "@/lib/map/build-map";
import { parseView, viewQuery, type ViewConfig } from "@/lib/map/view-config";

const STORE = "techradar.mapView";

function usable(v: ViewConfig, model: TechMapModel, projectIds: string[]): ViewConfig {
  const mineMap = model.mode === "mine";
  const project = mineMap && projectIds.length > 1 && projectIds.includes(v.filter.project) ? v.filter.project : "";
  return { ...v, filter: { ...v.filter, mineOnly: mineMap && v.filter.mineOnly, project } };
}

export function useMapView(initialQuery: string, model: TechMapModel, projectIds: string[], canSave: boolean) {
  const [raw, setRaw] = useState<ViewConfig>(() => parseView(initialQuery));
  // 주소에 보기 설정이 없으면 이 브라우저가 기억한 마지막 보기(없거나 막혀 있으면 기본 보기)
  useEffect(() => {
    if (initialQuery || !canSave) return;
    try { const saved = localStorage.getItem(STORE); if (saved) setRaw(parseView(saved)); } catch { /* 저장소를 못 쓰는 브라우저: 기본 보기 */ }
  }, [initialQuery, canSave]);
  const view = useMemo(() => usable(raw, model, projectIds), [raw, model, projectIds]);
  function setView(v: ViewConfig) {
    setRaw(v);
    const q = viewQuery(v);
    history.replaceState(null, "", q ? `?${q}` : location.pathname);
    if (canSave) try { localStorage.setItem(STORE, q); } catch { /* 기억은 편의일 뿐 */ }
  }
  return { view, setView };
}
