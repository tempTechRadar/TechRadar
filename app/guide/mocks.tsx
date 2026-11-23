// Tutorial 단계 카드의 장면 그림(I-tutorial-motion): 실제 화면과 같은 클래스(.btn · .btn-primary · .chip · .tag · .notice)로 "이렇게 생긴 걸 누르면 이게 생겨요"를 그린다.
// 그림은 상태(view)만 보고 그린다: view.on("이름")이 켜진 것만 보이고, view.typed("칸")만큼 글자가 쳐져 있다. 언제 켜지는지는 lib/tutorial/guide-scenes.ts의 박자가 정한다.
// 끝 프레임(모두 켜짐)은 옛 "모양 예시"와 같은 정보다: 스크립트가 꺼졌거나 움직임 줄이기면 그 한 장이 정지 그림이 된다.
// 누를 수 없는 그림이라 단추 대신 span으로 그리고(초점이 가지 않게), 화면 읽기에는 숨긴다(같은 내용을 행동 목록이 글로 말함).
// 숫자 대신 n을 쓴다: 가짜 데이터로 보이지 않게. 동그라미 숫자(M)는 왼쪽 행동 목록의 번호와 짝이다. t = 커서가 가는 곳 이름.
// 여기 글자는 실제 화면 글자이거나 lib/tutorial/guide-sections.ts의 MOCK_PLACEHOLDERS여야 한다(시험이 대조).
import type { ReactNode } from "react";
import { ALERT_KINDS, BAND_CELLS, EXPORT_KINDS, type GuideStep } from "@/lib/tutorial/guide-steps";

/** 장면이 그림에 알려 주는 것: 켜진 상태 · 쳐진 글자 · 지금 글자가 쳐지는 칸 */
export type SceneView = { on: (flag: string) => boolean; typed: (at: string) => string | undefined; typing: string | null };
type P = { v: SceneView };

function M({ n, block, children }: { n: number; block?: boolean; children: ReactNode }) {
  return <span className={block ? "g-mark g-mark-block" : "g-mark"} data-n={n}>{children}</span>;
}
const Btn = ({ primary, small, t, children }: { primary?: boolean; small?: boolean; t?: string; children: ReactNode }) =>
  <span className={`btn${primary ? " btn-primary" : ""}${small ? " g-btn-sm" : ""}`} data-t={t}>{children}</span>;
/** 글 쓰는 칸: 아직 안 쳤으면 자리 글(children), 치는 중이면 쳐진 만큼 + 깜박이지 않는 커서 막대 */
function Field({ v, t, children }: P & { t?: string; children: ReactNode }) {
  const text = t ? v.typed(t) : undefined;
  return <span className="g-input" data-t={t} data-typing={t && v.typing === t ? "" : undefined}>{text === undefined ? children : <span className="g-typed">{text}</span>}</span>;
}
/** 상태가 켜져야 나타나는 조각(자리는 늘 차지: 나타날 때 다른 것이 밀리지 않게). not = 켜지면 사라지는 조각 */
function Show({ v, on, not, className, children }: P & { on: string; not?: boolean; className?: string; children: ReactNode }) {
  return <span className={`g-s${className ? ` ${className}` : ""}`} data-on={v.on(on) !== !!not ? "" : undefined}>{children}</span>;
}
const tgt = (yes: boolean, name: string) => (yes ? name : undefined);
const Nav = ({ children }: { children: ReactNode }) => <span className="g-nav"><b>TechRadar</b>{children}</span>;

function Start({ v }: P) {
  return <>
    <Nav><span className="g-gap" /><M n={1}><span className="g-link" data-t="login">로그인</span></M></Nav>
    <Show v={v} on="door" className="g-row"><M n={1}><Btn primary t="google">구글로 계속하기</Btn></M></Show>
    <Show v={v} on="welcome"><M n={2} block><span className="notice notice-empty g-notice"><strong>가입을 마치려면 별명을 정해 주세요.</strong>
      <span className="g-row"><Field v={v} t="nick">별명</Field><Btn small t="save">저장</Btn><Show v={v} on="saved"><strong>저장했어요.</strong></Show></span></span></M></Show>
    <Show v={v} on="taste" className="g-row"><span className="muted">취향 질문</span><M n={3}><span className="g-link" data-t="skip">건너뛰기</span></M>
      <Show v={v} on="skipped" className="g-row"><span className="muted">설정</span><span className="g-link">취향 고치기</span></Show></Show>
  </>;
}

function Protect({ v }: P) {
  return <>
    <span className="g-label">+ 레포 등록</span>
    <span className="g-row g-line"><M n={1}><Field v={v} t="url">https://github.com/owner/repo (공개 저장소)</Field></M><M n={2}><Btn primary small t="reg">등록하고 읽기</Btn></M></span>
    <span className="g-stack">
      <span className="g-swap"><Show v={v} on="reading"><span className="muted">읽는 중…</span></Show><Show v={v} on="check"><M n={3} block><span className="notice first-check g-notice">첫 점검: 위험 n · 주의 n</span></M></Show></span>
      <span className="g-band" data-on={v.on("band") ? "" : undefined}>{BAND_CELLS.map((c) => <span key={c}><span>{c}</span><b>n</b></span>)}</span></span>
    <span className="g-row"><M n={4}><span className="g-link" data-t="repo">내 레포 이름</span></M><Show v={v} on="detail"><span className="muted">사용 중인 항목 n</span></Show></span>
  </>;
}

const SKY = ["--cat-1", "--cat-2", "--cat-3", "--cat-6", "--cat-4", "--cat-1", "--cat-7"];
function Choose({ v }: P) {
  function chip(name: string, picked?: boolean) {
    return <span className="chip" data-t={tgt(!!picked, "chip")} aria-current={picked && v.on("filtered") ? "true" : undefined}>{name} <b>n</b></span>;
  }
  return <>
    <Nav><span>프로젝트</span><span className="g-nav-now">지도</span><span>청사진<Show v={v} on="carted"><span className="g-badge g-badge-nav">1</span></Show></span></Nav>
    <M n={1} block><span className="g-row g-chips"><span className="g-seg">새 기술</span>{chip("오늘")}{chip("이번 주", true)}{chip("이번 달")}{chip("위험·주의")}{chip("사용 중")}</span></M>
    <span className="g-map">
      <span className="g-sky" data-filtered={v.on("filtered") ? "" : undefined}>
        {SKY.map((t, i) => <i key={i} style={{ background: `var(${t})` }} />)}
        <M n={2}><i className="g-dot-big" data-t="dot" data-picked={v.on("panel") ? "" : undefined} style={{ background: "var(--cat-2)" }} /></M>
      </span>
      <Show v={v} on="panel" className="g-side">
        <b>기술 이름</b>
        <span className="g-row"><span className="tag">통과</span><span className="muted">비교군 · 출처</span></span>
        <M n={3}><Btn primary t="cart">청사진에 담기</Btn></M>
        <Show v={v} on="carted"><span className="g-toast">청사진에 담았어요.</span></Show>
      </Show>
    </span>
  </>;
}

const Bell = () => <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
function Judge({ v }: P) {
  return <>
    <Nav><span className="g-gap" /><M n={1}><span className="g-row g-bell-row"><span className="muted">종 숫자 = 판단 대기 수</span><span className="g-bell" data-t="bell"><Bell /><span className="g-badge">n</span></span></span></M></Nav>
    <Show v={v} on="kinds"><M n={2} block><span className="g-kinds">{ALERT_KINDS.map((k, i) => (
      <span key={k.name} data-t={tgt(i === 1, "kind")} data-look={i === 1 && v.on("look") ? "" : undefined}><span className={`tag${i === 0 ? " g-tag-danger" : ""}`}>{k.name}</span><span>{k.when}</span></span>
    ))}</span></M></Show>
    <Show v={v} on="card"><span className="card g-card">
      <b>판단하기</b>
      <span className="muted">저장하기 전에는 아무것도 바뀌지 않아요.</span>
      <M n={3} block><span className="g-row"><Btn primary t="go">{ALERT_KINDS[1].primary}</Btn><Btn>보류…</Btn></span></M>
    </span></Show>
    <Show v={v} on="judged"><M n={4} block><span className="g-row g-done"><span className="muted">판단을 남겼을 뿐, 설치하거나 바꾼 것은 없어요.</span><Btn t="next">다음 판단 대기 →</Btn></span></M></Show>
  </>;
}

/** 커서가 끌고 가는 기술 칩(청사진 짜기) */
export const CarryChip = () => <span className="g-chip-tech">담은 기술</span>;
function Compose({ v }: P) {
  return <>
    <span className="g-row g-toolbar"><M n={1}><Btn t="add">＋ 단계</Btn></M><span className="muted">위 막대</span></span>
    <span className="g-stages">
      <span className="g-node"><b>단계 1</b><span className="g-chip-tech">담은 기술</span></span>
      <span className="g-wire" data-on={v.on("linked") ? "" : undefined}><i /></span>
      <Show v={v} on="stage2" className="g-node"><b>단계 2</b><M n={2}><span className="g-slot" data-t="drop">
        <Show v={v} on="dropped" not><span className="g-drop">아래에서 기술을 끌어 놓아요</span></Show><Show v={v} on="dropped"><span className="g-chip-tech">담은 기술</span></Show></span></M></Show>
    </span>
    <span className="g-dock">
      <span className="g-row"><span className="chip" aria-current="true">기술</span><span className="chip">변경 이력</span></span>
      <span className="g-row"><span className="g-chip-tech" data-t="tech" data-grab={v.on("grab") ? "" : undefined}>담은 기술</span><M n={2}><Btn small>넣기</Btn></M><span className="muted">또는 끌어 놓기</span></span>
    </span>
    <M n={3} block><span className="g-row g-toolbar"><span className="g-label">앞 단계 고르기</span><Field v={v}>단계 1</Field><Btn small t="link">잇기</Btn></span></M>
  </>;
}

function Export({ v }: P) {
  return <>
    <span className="g-row g-toolbar"><M n={1}><Btn primary t="open">확정 · 내보내기</Btn></M></span>
    <Show v={v} on="dialog" className="g-dialog">
      <b>내보내기</b>
      <M n={2} block><span className="g-row g-chips"><span className="g-label">형식</span>{EXPORT_KINDS.map((k, i) => (
        <span key={k} className="chip" data-t={tgt(i === 0, "kind")} data-sure={i === 0 && v.on("kind") ? "" : undefined} aria-current={i === 0 ? "true" : undefined}>{k}</span>
      ))}</span></M>
      <span className="g-row"><M n={3}><Btn t="copy">복사</Btn></M><Show v={v} on="copied"><span className="g-toast">복사했어요. Claude Code에 붙여 넣어 쓰세요.</span></Show></span>
      <b>확정</b>
      <span className="g-row"><span className="muted">로그인했으면</span><M n={4}><Btn primary t="confirm">이대로 확정</Btn></M></span>
      <Show v={v} on="confirmed"><span className="g-toast">확정해서 내 이력에 남겼어요. 아래 AI 점검에서 점검을 받을 수 있어요.</span></Show>
    </Show>
  </>;
}

const MOCKS: Record<GuideStep["id"], (p: P) => ReactNode> = { start: Start, protect: Protect, choose: Choose, judge: Judge, compose: Compose, export: Export };

/** 단계의 장면 그림(상태만 받아 그린다) */
export function SceneBody({ id, view }: { id: GuideStep["id"]; view: SceneView }) {
  const Mock = MOCKS[id];
  return <Mock v={view} />;
}
