// 내 태그 자동 제안(P-12f 8, 사용자 결정 "규칙, 사람이 고름"). 순수 함수: 기술의 분야 · 갈래 · 하는 일 · 종류 · 공식에서 태그 후보를 만든다.
// 붙이는 것은 사람이 체크한 것만(addTag, 한도 · 비밀값 검사는 그대로). 상대 경로 import: node --test가 불러오게.
import { MAX_TAGS_PER_TECH, normalizeTag, tagKey } from "./my-tech-tag.ts";
import { STAGE_FIELDS } from "../blueprint/knowledge.ts";

export type TagFacts = { field: string; sub: string; kind: string; official: boolean };
const UNKNOWN = new Set(["아직 분류 안 됨", "직접 넣은 것"]); // 지도의 "분류 전" 표시는 태그가 아니다(build-map UNSORTED · MANUAL_KIND)
const DOES_MAX = 2; // 하는 일(청사진 단계 이름)은 앞의 두 개만: 개발 · 리뷰처럼 넓은 갈래가 단계 대여섯 개를 다 끌고 오지 않게

/** 청사진 단계 중 이 분야 · 갈래가 맞는 것(STAGE_FIELDS를 거꾸로) */
const doesOf = (f: TagFacts) => Object.entries(STAGE_FIELDS).filter(([, fields]) => fields.includes(f.field) || fields.includes(f.sub)).map(([stage]) => stage).slice(0, DOES_MAX);

/** 태그 후보(순서 = 분야 → 갈래 → 하는 일 → 종류 → 공식). 이미 붙은 것(대소문자 무시) · 규칙에 안 맞는 글자는 빼고, 기술당 한도 안에서만 */
export function suggestTags(f: TagFacts, existing: string[]): string[] {
  const raw = [f.field, f.sub, ...doesOf(f), f.kind, f.official ? "공식" : ""].filter((t) => t && !UNKNOWN.has(t));
  const seen = new Set(existing.map(tagKey));
  const out: string[] = [];
  for (const r of raw) {
    const c = normalizeTag(r);
    if (!c.ok || seen.has(tagKey(c.tag))) continue;
    seen.add(tagKey(c.tag));
    out.push(c.tag);
  }
  return out.slice(0, Math.max(0, MAX_TAGS_PER_TECH - existing.length));
}
