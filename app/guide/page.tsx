import Link from "next/link";
import { FAQ, GRADES, LOGIN_LABEL, MORE_SCREENS, MOTTO, ONE_LINER, PROMISES, splitUiNames } from "@/lib/tutorial/guide-steps";
import { Guide } from "./guide";
import "./guide.css";

// 둘러보기(IA-27, 11-23 사용자 요청): 처음 쓰는 사람이 5분 안에 "무엇이고, 무엇을 어떤 순서로 하고, 무엇이 보장되나"를 따라 하는 안내. 로그인 없이 열린다(DB를 읽지 않음).
// 내용은 lib/tutorial/guide-steps.ts 한 곳에만 있고, 시험이 근거 파일의 실제 문구와 대조한다.
export const metadata = { title: "둘러보기 · TechRadar" };

const Ui = ({ text }: { text: string }) => <>{splitUiNames(text).map((p, i) => (p.ui ? <b key={i} className="g-ui">{p.text}</b> : <span key={i}>{p.text}</span>))}</>;

export default function GuidePage() {
  return (
    <main className="page guide">
      <header className="g-intro">
        <h1>TechRadar 둘러보기</h1>
        <p className="g-lead">{ONE_LINER}</p>
        <ul className="g-motto" aria-label="기준 문장과 메뉴">{MOTTO.map((m) => (
          <li key={m.verb}>
            <Link href={m.href}><strong>{m.verb}</strong><span className="g-menu">메뉴 <b className="g-ui">{m.menu}</b></span><span className="g-what">{m.what}</span></Link>
          </li>
        ))}</ul>
        <p className="muted">아래 6단계를 차례로 따라 하면 5분쯤 걸려요. 단계마다 그 화면으로 바로 갈 수 있어요.</p>
      </header>

      <Guide />

      <section id="g-grades" aria-labelledby="g-grades-h" className="g-sec">
        <h2 id="g-grades-h">등급과 색이 뜻하는 것</h2>
        <ul className="g-grades">{GRADES.map((g) => (
          <li key={g.name}>
            <span className={`g-swatch g-swatch-${g.shape}`} style={{ ["--sw" as string]: `var(${g.token})` }} aria-hidden="true" />
            <span><b>{g.name}</b><span className="g-mean">{g.meaning}</span></span>
          </li>
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
        <p className="muted">메뉴에 바로 보이지 않지만 쓸 수 있는 화면이에요.</p>
        <ul className="g-more">{MORE_SCREENS.map((m) => (
          <li key={m.href}><Link href={m.href}>{m.title}</Link><span className="tag">{LOGIN_LABEL[m.login]}</span><span className="g-mean">{m.what}</span></li>
        ))}</ul>
      </section>
    </main>
  );
}
