// 관리자 첫 화면 "관제 요약"의 그림(11-23 리뉴얼). 데이터만 받는다: 실제 화면(/admin)은 DB에서 읽은 값을, 견본(/dev/admin-sample)은 가짜 값을 넣는다.
// 숫자 타일 · 시연 순서(링크만) · 불변 규칙 띠. 판단 단추는 없다(불변 1). 못 읽은 숫자는 "읽지 못함"과 이유를 보인다(불변 2).
import Link from "next/link";
import { overviewTiles, type OverviewData, type Tile } from "@/lib/server/admin-overview";
import { AdminShell } from "./admin-shell";
import { AdminSection } from "./admin-ui";

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
    <li className="admin-stat" data-tone={t.tone}>
      <Link href={t.href}>
        <span className="admin-stat-label">{t.label}</span>
        <b className="admin-stat-value">{t.value}</b>
        {t.sub ? <span className="admin-stat-sub">{t.sub}</span> : null}
        {t.reason ? <span className="admin-stat-reason">{t.reason}</span> : null}
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
        <AdminSection key={g.id} id={`ov-${g.id}`} title={g.label}>
          <ul className="admin-stats">{g.tiles.map((t) => <TileCard key={t.key} t={t} />)}</ul>
        </AdminSection>
      ))}

      <AdminSection id="ov-demo" title="시연 순서">
        <ol className="admin-steps">
          {DEMO_STEPS.map((s) => (
            <li key={s.title}><Link href={s.href}><b>{s.title}</b><span>{s.say}</span></Link></li>
          ))}
        </ol>
      </AdminSection>

      <AdminSection id="ov-rules" title="바뀌지 않는 규칙">
        <ul className="admin-rules">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </AdminSection>
    </>
  );
}

export const OVERVIEW_TITLE = "관제 요약";
const LEAD = "정기 실행 · 수집 오류 · 사람 판단 · 분류 확인 거리를 한 장에 모았어요. 숫자를 누르면 그 화면으로 가요.";
const PROVES = "자동으로 지켜본 결과와 실패가 숫자로 남고, 판단 대기는 사람 차례로 남아 있다는 것";
const TOOLBAR = { links: [{ href: "/admin/simulator", label: "시뮬레이터" }, { href: "/admin/flow", label: "흐름 화면" }, { href: "/admin/runs", label: "수집 실행과 오류" }] };

/** 관제 요약 화면 전체(틀 포함). title · lead · sampleNote는 견본이 "가짜 값"이라고 밝힐 때만 바꾼다 */
export function OverviewBody({ data, now, title = OVERVIEW_TITLE, lead = LEAD, sampleNote }: { data: OverviewData; now?: Date; title?: string; lead?: string; sampleNote?: string }) {
  return (
    <AdminShell tab="" title={title} lead={lead} proves={PROVES} toolbar={TOOLBAR} notes={[sampleNote ? { tone: "warning", role: "note", text: sampleNote } : null]}>
      <AdminOverview data={data} now={now} />
    </AdminShell>
  );
}
