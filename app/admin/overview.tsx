// 관리자 첫 화면 "관제 요약"의 그림(11-23 리뉴얼). 데이터만 받는다: 실제 화면(/admin)은 DB에서 읽은 값을, 견본(/dev/admin-sample)은 가짜 값을 넣는다.
// 숫자 타일 · 시연 순서(링크만) · 불변 규칙 띠. 판단 단추는 없다(불변 1). 못 읽은 숫자는 "읽지 못함"과 이유를 보인다(불변 2).
import Link from "next/link";
import { overviewTiles, type OverviewData, type Tile } from "@/lib/server/admin-overview";

export const OVERVIEW_MESSAGE = "앱이 매일 혼자 지켜보고 실패까지 기록한 증거는 모두 여기 있고, 바꾸는 판단만은 사람 몫이에요.";

const DEMO_STEPS: { href: string; title: string; say: string }[] = [
  { href: "/admin/simulator", title: "시뮬레이터", say: "가짜 변경 1건(가짜 표시)으로 수집부터 알림까지 한 바퀴를 돌려요." },
  { href: "/admin/flow", title: "흐름 화면", say: "방금 돈 실행이 실제 기록(runs · run_steps)대로 칠해져요." },
  { href: "/admin/alerts", title: "알림 판단은 시연 계정으로", say: "관리자 화면엔 판단 단추가 없어요. 시연 계정으로 로그인해 그 알림을 판단해요." },
  { href: "/admin/demo", title: "실패 장면", say: "개발 컴퓨터는 실패 시연 단추, 운영은 깨진 시연 저장소를 등록해 빨간 상자를 보여 줘요." },
  { href: "/admin/chat", title: "위키 챗봇 Q5", say: "문서끼리 다른 곳을 한쪽으로 정리하지 않고 두 출처를 모두 말하는지 봐요." },
];

const RULES = ["사람이 판단하기 전엔 아무것도 바뀌지 않아요", "수집 실패는 '변화 없음'이 아니라 '수집 오류'로 남아요", "흐름 화면은 실제 실행 기록으로만 칠해요"];

function TileCard({ t }: { t: Tile }) {
  return (
    <li className="admin-tile" data-tone={t.tone}>
      <Link href={t.href}>
        <span className="admin-tile-label">{t.label}</span>
        <b className="admin-tile-value">{t.value}</b>
        {t.sub ? <span className="admin-tile-sub">{t.sub}</span> : null}
        {t.reason ? <span className="admin-tile-reason">{t.reason}</span> : null}
      </Link>
    </li>
  );
}

export function AdminOverview({ data, now }: { data: OverviewData; now?: Date }) {
  const groups = overviewTiles(data, now);
  return (
    <>
      <p className="admin-message">{OVERVIEW_MESSAGE}</p>

      {groups.map((g) => (
        <section key={g.id} className="admin-tiles" aria-labelledby={`ov-${g.id}`}>
          <h2 id={`ov-${g.id}`}>{g.label}</h2>
          <ul>{g.tiles.map((t) => <TileCard key={t.key} t={t} />)}</ul>
        </section>
      ))}

      <section aria-labelledby="ov-demo">
        <h2 id="ov-demo">시연 순서</h2>
        <ol className="admin-steps">
          {DEMO_STEPS.map((s) => (
            <li key={s.title}><Link href={s.href}><b>{s.title}</b><span>{s.say}</span></Link></li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ov-rules" className="admin-rules">
        <h2 id="ov-rules">바뀌지 않는 규칙</h2>
        <ul>{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </section>
    </>
  );
}
