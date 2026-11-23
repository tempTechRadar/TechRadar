import Link from "next/link";
import { FAQ, GRADES, MARKS, MORE_SCREENS, PROMISES, TERMS } from "@/lib/tutorial/guide-sections";
import { GAINS, LOGIN_LABEL, MOTTO, PROBLEM, REGISTER_HREF, SOLUTION, splitUiNames } from "@/lib/tutorial/guide-steps";
import { Guide } from "./guide";
import "./guide.css";

// 둘러보기(IA-27, 11-23 사용자 요청): 처음 쓰는 사람이 5분 안에 "무엇이고, 무엇을 어떤 순서로 하고, 무엇이 보장되나"를 따라 하는 안내. 로그인 없이 열린다(DB를 읽지 않음).
// 내용은 lib/tutorial/ 두 파일에만 있고, 시험이 근거 파일의 실제 문구와 대조한다.
// 주 단추(청록)는 맨 끝 "지금 내 레포 등록하기" 하나(P-12n). 맨 위 "1단계부터 따라 하기"는 같은 화면 안 이동이라 보조 단추
export const metadata = { title: "Tutorial · TechRadar" };

const Ui = ({ text }: { text: string }) => <>{splitUiNames(text).map((p, i) => (p.ui ? <b key={i} className="g-ui">{p.text}</b> : <span key={i}>{p.text}</span>))}</>;

const Swatch = ({ token, ring }: { token: string; ring?: boolean }) =>
  <span className={`g-swatch ${ring ? "g-swatch-ring" : "g-swatch-dot"}`} style={{ ["--sw" as string]: `var(${token})` }} aria-hidden="true" />;

export default function GuidePage() {
  return (
    <main className="page guide">
      <header className="g-intro">
        <h1>TechRadar Tutorial</h1>
        <p className="g-problem">{PROBLEM}</p>
        <p className="g-lead">{SOLUTION}</p>
        <ul className="g-motto" aria-label="기준 문장과 메뉴">{MOTTO.map((m) => (
          <li key={m.verb}>
            <Link href={m.href}><strong>{m.verb} <span aria-hidden="true">→</span></strong><span className="g-menu">메뉴 <b className="g-ui">{m.menu}</b></span><span className="g-what">{m.what}</span></Link>
          </li>
        ))}</ul>
        <div className="g-cta">
          <a className="btn" href="#step-1">1단계부터 따라 하기 ↓</a>
          <Link className="btn" href="/">로그인 없이 지도부터 구경</Link>
          <span className="g-note">6단계, 5분쯤 걸려요.</span>
        </div>
        <details className="g-terms">
          <summary>이 화면에서 쓰는 말</summary>
          <dl>{TERMS.map((t) => <div key={t.word}><dt>{t.word}</dt><dd>{t.mean}</dd></div>)}</dl>
        </details>
      </header>

      <Guide />

      <section id="g-done" aria-labelledby="g-done-h" className="g-sec g-done-sec">
        <h2 id="g-done-h">다 하면 얻는 것</h2>
        <ul className="g-gains">{GAINS.map((g) => <li key={g}>{g}</li>)}</ul>
        <div className="g-cta">
          <Link className="btn btn-primary" href={REGISTER_HREF}>지금 내 레포 등록하기 →</Link>
          <a href="#g-grades">등급과 표시 뜻 보기 ↓</a>
        </div>
      </section>

      <section id="g-grades" aria-labelledby="g-grades-h" className="g-sec">
        <h2 id="g-grades-h">등급과 표시가 뜻하는 것</h2>
        <h3 className="g-sub">등급 <span className="g-note">기술마다 하나</span></h3>
        <ul className="g-grades">{GRADES.map((g) => (
          <li key={g.name}><Swatch token={g.token} /><span><b>{g.name}</b><span className="g-mean">{g.meaning}</span></span></li>
        ))}</ul>
        <h3 className="g-sub">표시 <span className="g-note">등급이 아니라 등급 옆 · 알림에 붙어요</span></h3>
        <ul className="g-grades g-marks">{MARKS.map((m) => (
          <li key={m.name}><Swatch token={m.token} ring={m.shape === "ring"} /><span><b>{m.name}</b><span className="g-mean">{m.meaning}</span></span></li>
        ))}</ul>
      </section>

      <section aria-labelledby="g-promise-h" className="g-sec">
        <h2 id="g-promise-h">늘 지키는 약속 4가지</h2>
        <ol className="g-promises">{PROMISES.map((p) => <li key={p.title}><b>{p.title}</b><span>{p.body}</span></li>)}</ol>
      </section>

      <section aria-labelledby="g-faq-h" className="g-sec">
        <h2 id="g-faq-h">자주 묻는 질문</h2>
        <div className="g-faq">{FAQ.map((f) => (
          <details key={f.q}><summary>{f.q}</summary><p><Ui text={f.a} /></p></details>
        ))}</div>
      </section>

      <section aria-labelledby="g-more-h" className="g-sec">
        <h2 id="g-more-h">더 있는 화면</h2>
        <p className="g-note">메뉴에 바로 보이지 않지만 쓸 수 있는 화면이에요.</p>
        <ul className="g-more">{MORE_SCREENS.map((m) => (
          <li key={m.href}><Link href={m.href}>{m.title}</Link><span className="tag">{LOGIN_LABEL[m.login]}</span><span className="g-mean">{m.what}</span></li>
        ))}</ul>
      </section>
    </main>
  );
}
