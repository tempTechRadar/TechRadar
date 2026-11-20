import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { toAlertView, type AlertRecord } from "@/lib/alerts/to-alert-view";
import { toScenarioView } from "@/lib/alerts/to-scenario-view";
import { getMyAlert } from "@/lib/server/alert-queries";
import { getCurrentUser } from "@/lib/server/current-user";
import { readScenarioState } from "@/lib/server/scenario-queries";
import { readSimilarJudgments } from "@/lib/server/similar-judgments";
import { getServerSupabase } from "@/lib/supabase/server";
import { DraftCard } from "./draft-card";
import { JudgmentForm } from "./judgment-form";
import { ComparisonCard, ReasonCard } from "./opportunity-cards";
import { ScenarioCard } from "./scenario-card";
import { SimilarCard } from "./similar-card";
import "../alerts.css";

// 알림 상세(IA-7, PRD-F15). 적용 기회는 이유와 비교표(P-14), 대응안 초안(P-13), 적용 시나리오(P-15, IA-8).
// 적용 시나리오 만들기는 Claude를 부르는 서버 액션이라 시간이 걸린다(Vercel 함수 한도를 늘림).
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/alerts/${(await params).id}`)}`); // 알림 링크로 왔다면 로그인 뒤 그 알림으로
  const { id } = await params;
  if (!UUID.test(id)) notFound(); // 형식이 틀린 id는 DB가 오류로 답하므로 "불러오지 못함"과 섞이지 않게 먼저 거른다
  const supabase = (await getServerSupabase())!;
  const loaded = await getMyAlert(supabase, user.id, id).then((record) => ({ record }), (e) => { console.error("알림 상세 조회 실패", e); return null; });

  if (loaded === null) return <LoadError id={id} />;
  if (loaded.record === null) notFound();
  const view = toAlertView(loaded.record);
  const similar = await readSimilarJudgments(supabase, user.id, id).catch((e) => { console.error("비슷한 지난 판단 조회 실패", e); return null; });
  const scenario = loaded.record.kind === "model_eol" ? undefined
    : await readScenarioState(supabase, id, user.id, new Date()).then(({ latest, usedToday }) => toScenarioView(latest, usedToday, new Date()), (e) => { console.error("적용 시나리오 조회 실패", e); return null; });
  // 머리 + 2단(design.md 19절): 머리에 무엇 · 상태, 판단 줄을 바로 아래에. 왼쪽 = 바뀐 것과 근거, 오른쪽 = 비슷한 지난 판단
  return (
    <main className="alerts alert-detail">
      <header className="alert-head">
        <p className="muted"><Link href="/alerts">← 알림 목록으로</Link></p>
        <h1>{view.title}</h1>
        <p>
          <span className={`badge badge-${view.kindTone}`}>{view.kindLabel}</span>{" "}
          <span className={`badge badge-${view.statusTone}`}>{view.statusLabel}</span>
        </p>
        {view.judgmentLine ? (
          <article className="card" aria-labelledby="judged-title">
            <h2 id="judged-title">내 판단</h2>
            <p>{view.judgmentLine}</p>
            <p className="muted">판단을 남겼을 뿐, 설치하거나 바꾼 것은 없어요.</p>
          </article>
        ) : (
          <JudgmentForm alertId={loaded.record.id} canCandidate={view.canCandidate} kind={loaded.record.kind} candidateLabel={view.candidateLabel} />
        )}
      </header>
      <div className="alert-cols">
      <div className="alert-left">
      {view.lines.length > 0 && (
        <article className="card" aria-labelledby="changed-title">
          <h2 id="changed-title">무엇이 바뀌었나</h2>
          <dl className="kv">
            {view.lines.map((line) => {
              const [label, ...rest] = line.split(": ");
              return <Row key={label} label={label} value={rest.join(": ")} />;
            })}
          </dl>
        </article>
      )}
      {view.draftCard && <DraftCard card={view.draftCard} />}
      {view.reasonLine && <ReasonCard line={view.reasonLine} />}
      {view.comparison && <ComparisonCard comparison={view.comparison} />}
      {scenario !== undefined && <ScenarioCard alertId={loaded.record.id} card={scenario} />}
      </div>
      <aside className="alert-right" aria-label="참고">
        <RelatedCard record={loaded.record} createdAtLabel={view.createdAtLabel} judgedAtLabel={view.judgedAtLabel} judgmentLine={view.judgmentLine} />
        <SimilarCard similar={similar} />
      </aside>
      </div>
    </main>
  );
}

/** 오른쪽(design.md 19절): 관련된 내 기술(상세 · 지도에서 보기)과 이 알림의 기록(생김 → 판단) */
function RelatedCard({ record, createdAtLabel, judgedAtLabel, judgmentLine }: { record: AlertRecord; createdAtLabel: string; judgedAtLabel: string | null; judgmentLine: string | null }) {
  const where = [record.projectName ?? "프로젝트 밖(내 컴퓨터)", record.sourceFile].filter(Boolean).join(" · ");
  return (
    <article className="card" aria-labelledby="related-title">
      <h2 id="related-title">관련된 내 기술</h2>
      <p><strong>{record.change.techName}</strong> <span className="muted">{where}</span></p>
      {record.myTechnologyId || record.tech ? (
        <p>
          {record.myTechnologyId ? <Link href={`/projects/tech/${record.myTechnologyId}`}>내 기술 상세</Link> : null}
          {record.myTechnologyId && record.tech ? " · " : null}
          {record.tech ? <a href={`/?sel=${encodeURIComponent(`tech:${record.tech.id}`)}`}>지도에서 보기</a> : null}
        </p>
      ) : null}
      <h3>이 알림의 기록</h3>
      <ol className="muted">
        <li>{createdAtLabel} 알림이 생겼어요</li>
        {judgedAtLabel ? <li>{judgedAtLabel} {judgmentLine}</li> : <li>아직 판단하지 않았어요</li>}
      </ol>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{/^https?:\/\//i.test(value) ? <a href={value} target="_blank" rel="noreferrer">{value}</a> : value}</dd>
    </>
  );
}

function LoadError({ id }: { id: string }) {
  return (
    <main className="alerts">
      <div className="notice notice-error" role="alert">
        <strong>알림을 불러오지 못했어요.</strong> 알림이 없는 게 아니에요. 잠시 뒤에 다시 불러와 주세요. <Link href={`/alerts/${id}`}>다시 불러오기</Link>
      </div>
    </main>
  );
}
