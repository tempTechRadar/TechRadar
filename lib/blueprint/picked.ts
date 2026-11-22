// 손님이 지도에서 "청사진에 담기"로 고른 기술 목록(P-12h-2 T3): 이 브라우저(localStorage)에만, id만 · 30개까지 · 겹침 없음.
// 로그인한 사람은 쓰지 않는다(적용 후보가 기준). 깨진 값은 버리고 빈 목록으로 읽는다(못 읽어도 화면이 멈추지 않게).
import { isUuid } from "../domain/my-tech-view.ts";

export const PICKED_KEY = "blueprint-picked:guest";
export const PICKED_MAX = 30;

/** 저장된 글 → id 목록: 배열이 아니거나 JSON이 깨졌으면 빈 목록, uuid만 · 겹침 없이 · 앞에서부터 30개 */
export function readPicked(raw: string | null): string[] {
  let v: unknown;
  try { v = JSON.parse(raw ?? "[]"); } catch { return []; }
  return Array.isArray(v) ? [...new Set(v.filter(isUuid))].slice(0, PICKED_MAX) : [];
}

/** 담기: 이미 있으면 그대로(exists), 30개면 넣지 않음(full) */
export function addPicked(list: string[], id: string): { list: string[]; result: "added" | "exists" | "full" | "bad" } {
  if (!isUuid(id)) return { list, result: "bad" };
  if (list.includes(id)) return { list, result: "exists" };
  if (list.length >= PICKED_MAX) return { list, result: "full" };
  return { list: [...list, id], result: "added" };
}

export const removePicked = (list: string[], id: string): string[] => list.filter((x) => x !== id);

/** 브라우저 저장소 읽기 · 쓰기(막힌 브라우저 · 사생활 모드면 읽기는 빈 목록, 쓰기는 false) */
export function loadPicked(): string[] {
  try { return readPicked(localStorage.getItem(PICKED_KEY)); } catch { return []; }
}
export function savePicked(list: string[]): boolean {
  try { localStorage.setItem(PICKED_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
