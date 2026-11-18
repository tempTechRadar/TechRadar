import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { toAlertView } from "@/lib/alerts/to-alert-view";
import { getMyAlert } from "@/lib/server/alert-queries";
import { getCurrentUser } from "@/lib/server/current-user";
import { readSimilarJudgments } from "@/lib/server/similar-judgments";
import { getServerSupabase } from "@/lib/supabase/server";
import { DraftCard } from "./draft-card";
import { JudgmentForm } from "./judgment-form";
import { ComparisonCard, ReasonCard } from "./opportunity-cards";
import { SimilarCard } from "./similar-card";
import "../alerts.css";

// 알림 상세(IA-7, PRD-F15). 적용 기회는 이유와 비교표(P-14). 대응안 초안은 P-13, 적용 시나리오는 P-13 인프라(Claude 한도) 뒤에 붙인다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!UUID.test(id)) notFound(); // 형식이 틀린 id는 DB가 오류로 답하므로 "불러오지 못함"과 섞이지 않게 먼저 거른다
  const supabase = (await getServerSupabase())!;
  const loaded = await getMyAlert(supabase, user.id, id).then((record) => ({ record }), (e) => { console.error("알림 상세 조회 실패", e); return null; });

  if (loaded === null) return <LoadError id={id} />;
  if (loaded.record === null) notFound();
  const view = toAlertView(loaded.record);
  const similar = await readSimilarJudgments(supabase, user.id, id).catch((e) => { console.error("비슷한 지난 판단 조회 실패", e); return null; });
  return (
    <main className="alerts">
      <p className="muted"><Link href="/alerts">← 알림 목록으로</Link></p>
      <h1>{view.title}</h1>
      <p>
        <span className={`badge badge-${view.kindTone}`}>{view.kindLabel}</span>{" "}
        <span className={`badge badge-${view.statusTone}`}>{view.statusLabel}</span>
      </p>
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
      <SimilarCard similar={similar} />
      {view.judgmentLine ? (
        <article className="card" aria-labelledby="judged-title">
          <h2 id="judged-title">내 판단</h2>
          <p>{view.judgmentLine}</p>
        </article>
      ) : user.role === "admin" ? (
        <p className="muted">관리자는 판단을 저장할 수 없어요.</p>
      ) : (
        <JudgmentForm alertId={loaded.record.id} canCandidate={view.canCandidate} />
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
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
