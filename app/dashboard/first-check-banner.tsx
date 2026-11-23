import Link from "next/link";
import type { FirstCheckBand } from "@/lib/alerts/first-check-band";
import { dismissFirstCheck } from "./actions";

// 첫 점검 요약 띠(PRD-F14, IA-10, SPEC-5.2). 첫 화면(지도, P-12c)이 생기면 그리로 옮긴다. 확인하면 이 실행의 띠는 다시 안 보인다.
/** riskyHref: 지도에서 쓰면 위험·주의 필터를 켜는 단추(P-12n) */
export function FirstCheckBanner({ band, riskyHref }: { band: FirstCheckBand; riskyHref?: string }) {
  return (
    <section className="notice first-check" role="status" aria-label="첫 점검 요약">
      <strong>{band.text}</strong>
      {band.notes.map((note) => <span key={note} className="muted">{note}</span>)}
      {riskyHref ? <Link className="btn btn-primary" href={riskyHref}>위험·주의 보기</Link> : null}
      <form action={dismissFirstCheck}>
        <input type="hidden" name="runId" value={band.runId} />
        <button type="submit" className="btn">확인</button>
      </form>
    </section>
  );
}
