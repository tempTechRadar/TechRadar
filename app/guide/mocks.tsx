// 둘러보기 단계 카드의 "모양 예시": 실제 화면과 같은 클래스(.btn · .btn-primary · .chip · .tag · .notice)로 "이렇게 생긴 걸 누르세요"를 그린다.
// 누를 수 없는 그림이라 단추 대신 span으로 그리고(초점이 가지 않게), 화면 읽기에는 숨긴다(같은 내용을 행동 목록이 글로 말함).
// 숫자 대신 n을 쓴다: 가짜 데이터로 보이지 않게. 동그라미 숫자(M)는 왼쪽 행동 목록의 번호와 짝이다.
import type { ReactNode } from "react";
import { ALERT_KINDS, BAND_CELLS, EXPORT_KINDS, type GuideStep } from "@/lib/tutorial/guide-steps";

function M({ n, block, children }: { n: number; block?: boolean; children: ReactNode }) {
  return <span className={block ? "g-mark g-mark-block" : "g-mark"} data-n={n}>{children}</span>;
}
const Btn = ({ primary, small, children }: { primary?: boolean; small?: boolean; children: ReactNode }) =>
  <span className={`btn${primary ? " btn-primary" : ""}${small ? " g-btn-sm" : ""}`}>{children}</span>;
const Field = ({ children }: { children: ReactNode }) => <span className="g-input">{children}</span>;
const Arrow = () => <span className="g-arrow">→</span>;

function Start() {
  return <>
    <div className="g-row"><Btn>로그인</Btn><Arrow /><M n={1}><Btn primary>구글로 계속하기</Btn></M></div>
    <M n={2} block><span className="notice notice-empty g-notice"><strong>가입을 마치려면 별명을 정해 주세요.</strong><span className="g-row"><Field>별명</Field><Btn small>저장</Btn></span></span></M>
    <div className="g-row"><span className="muted">취향 질문</span><M n={3}><span className="g-link">건너뛰기</span></M></div>
  </>;
}

function Protect() {
  return <>
    <div className="g-row"><span className="g-label">+ 레포 등록</span><M n={1}><Field>https://github.com/owner/repo (공개 저장소)</Field></M><M n={2}><Btn primary small>등록하고 읽기</Btn></M></div>
    <M n={3} block><span className="g-stack"><span className="notice first-check g-notice">첫 점검: 위험 n · 주의 n</span>
      <span className="g-band">{BAND_CELLS.map((c) => <span key={c}><span>{c}</span><b>n</b></span>)}</span></span></M>
    <div className="g-row"><M n={4}><span className="g-link">내 레포 이름</span></M><span className="muted">사용 중인 항목 n</span></div>
  </>;
}

function Choose() {
  return <>
    <M n={1} block><span className="g-row"><span className="g-seg">새 기술</span><span className="chip" aria-current="true">오늘 <b>n</b></span><span className="chip">이번 주 <b>n</b></span><span className="chip">이번 달 <b>n</b></span><span className="chip">위험·주의 <b>n</b></span><span className="chip">사용 중 <b>n</b></span></span></M>
    <div className="g-map">
      <span className="g-sky" aria-hidden="true">
        {["--cat-1", "--cat-2", "--cat-3", "--cat-6", "--cat-4", "--cat-1", "--cat-7"].map((t, i) => <i key={i} style={{ background: `var(${t})` }} />)}
        <M n={2}><i className="g-dot-big" style={{ background: "var(--cat-2)" }} /></M>
      </span>
      <span className="g-side">
        <b>기술 이름</b>
        <span className="g-row"><span className="tag">하는 일</span><span className="tag">통과</span></span>
        <M n={3}><Btn primary>청사진에 담기</Btn></M>
        <span className="muted">비교군 · 출처</span>
      </span>
    </div>
  </>;
}

function Judge() {
  return <>
    <div className="g-row"><M n={1}><span className="g-row g-bell-row"><span className="g-bell"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg><span className="g-badge">n</span></span><span className="muted">종 숫자 = 판단 대기 수</span></span></M></div>
    <M n={2} block><span className="g-kinds">{ALERT_KINDS.map((k) => <span key={k.name}><span className={`tag${k.name === "보안 경고" ? " g-tag-danger" : ""}`}>{k.name}</span><span>{k.when}</span></span>)}</span></M>
    <span className="card g-card">
      <b>판단하기</b>
      <span className="muted">저장하기 전에는 아무것도 바뀌지 않아요.</span>
      <M n={3} block><span className="g-row"><Btn primary>{ALERT_KINDS[0].primary}</Btn><Btn>보류…</Btn></span></M>
    </span>
    <M n={4} block><span className="g-row g-done"><span className="muted">판단을 남겼을 뿐, 설치하거나 바꾼 것은 없어요.</span><Btn>다음 판단 대기 →</Btn></span></M>
  </>;
}

function Compose() {
  return <>
    <div className="g-row g-toolbar"><M n={1}><Btn>＋ 단계</Btn></M><span className="muted">위 막대</span></div>
    <M n={3} block><span className="g-stages"><span className="g-stage"><b>단계 1</b><span className="g-chip-tech">담은 기술</span></span><Arrow /><span className="g-stage"><b>단계 2</b><span className="g-drop">여기에 놓기</span></span></span></M>
    <span className="g-dock">
      <span className="g-row"><span className="chip" aria-current="true">기술</span><span className="chip">변경 이력</span></span>
      <span className="g-row"><span className="g-chip-tech">담은 기술</span><M n={2}><Btn small>넣기</Btn></M><span className="muted">또는 끌어 놓기</span></span>
    </span>
  </>;
}

function Export() {
  return <>
    <div className="g-row g-toolbar"><M n={1}><Btn primary>확정 · 내보내기</Btn></M></div>
    <span className="g-dialog">
      <b>내보내기</b>
      <M n={2} block><span className="g-row"><span className="g-label">형식</span>{EXPORT_KINDS.map((k, i) => <span key={k} className="chip" aria-current={i === 0 ? "true" : undefined}>{k}</span>)}</span></M>
      <span className="g-row"><M n={3}><Btn>복사</Btn></M><span className="g-toast">복사했어요. Claude Code에 붙여 넣어 쓰세요.</span></span>
      <b>확정</b>
      <span className="g-row"><span className="muted">로그인했으면</span><M n={4}><Btn primary>이대로 확정</Btn></M></span>
    </span>
  </>;
}

const MOCKS: Record<GuideStep["id"], () => ReactNode> = { start: Start, protect: Protect, choose: Choose, judge: Judge, compose: Compose, export: Export };

export function StepMock({ id }: { id: GuideStep["id"] }) {
  const Mock = MOCKS[id];
  return (
    <figure className="g-mock">
      <figcaption>모양 예시 <span className="muted">· 실제 화면에서 이렇게 생긴 걸 찾아요. 숫자는 왼쪽 순서</span></figcaption>
      <div className="g-mock-body" aria-hidden="true"><Mock /></div>
    </figure>
  );
}
