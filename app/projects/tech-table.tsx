import Link from "next/link";
import type { AlertRecord } from "@/lib/alerts/to-alert-view";
import type { StatusTechRow } from "@/lib/dashboard/status-view";
import { GRADE_TONE, gradeText } from "@/lib/domain/my-tech-view";
import { KIND_KO, MANUAL_KIND } from "@/lib/map/build-map";
import { toggleHidden } from "./tech-actions";

// 레포의 사용 중인 항목 표 한 벌(P-12k K2: 옛 보드 레포 서랍 표 + 옛 /projects 내 기술 표를 합침, IA-3).
// 이름 · 종류 · 출처 파일 · 등급 라벨(내 버전 기준, erd 2.2) · 판단(지도 표시) · 최근 바뀜 · 마지막 확인 · 숨기기/되돌리기. 이름을 누르면 기술 상세.
// alerts · marks = null: 못 읽음("못 읽음"으로, 없음과 다르게 불변 2). from = 레포 id(숨기기 뒤 이 레포 상세로 돌아옴)
const MARK_KO: Record<string, string> = { candidate: "담음", interest: "★ 관심", hold: "보류" };
const short = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const when = (iso: string) => short.format(new Date(iso));

export function RepoTechTable({ techs, alerts, marks, from, caption }: { techs: StatusTechRow[]; alerts: AlertRecord[] | null; marks: Map<string, string> | null; from: string; caption: string }) {
  const changed = new Map<string, string>();
  for (const a of alerts ?? []) if (a.myTechnologyId && (!changed.has(a.myTechnologyId) || Date.parse(a.createdAt) > Date.parse(changed.get(a.myTechnologyId)!))) changed.set(a.myTechnologyId, a.createdAt);
  return (
    <table className="board-table repo-table"><caption className="sr-only">{caption}</caption>
      <thead><tr><th scope="col">이름</th><th scope="col">종류</th><th scope="col">출처 파일</th><th scope="col">등급</th><th scope="col">판단</th><th scope="col">최근 바뀜</th><th scope="col">마지막 확인</th><th scope="col"><span className="sr-only">숨기기</span></th></tr></thead>
      <tbody>{techs.map((t) => { const name = t.technologies?.display_name ?? t.manual_name ?? "(이름 없음)", type = t.technologies?.type, action = t.hidden_at ? "되돌리기" : "숨기기"; return (
        <tr key={t.id}>
          <th scope="row"><Link href={`/projects/tech/${t.id}`}>{name}</Link></th>
          <td>{type ? KIND_KO[type] ?? type : MANUAL_KIND}</td>
          <td>{t.source_file ?? <span className="muted">—</span>}</td>
          <td><span className={`badge badge-${GRADE_TONE[t.grade]}`}>{gradeText(t.grade, t.technologies?.tech_key, type)}</span>{t.collect_error_kind ? <span className="board-warn"> 수집 오류(지난 값)</span> : null}</td>
          <td>{marks === null ? <span className="board-warn">못 읽음</span> : t.tech_id ? MARK_KO[marks.get(t.tech_id) ?? ""] ?? "—" : "—"}</td>
          <td>{alerts === null ? <span className="board-warn">못 읽음</span> : changed.has(t.id) ? when(changed.get(t.id)!) : "—"}</td>
          {/* 수집 오류 줄은 읽은 때가 아니라 마지막으로 확인에 성공한 때(방금 확인한 것처럼 보이지 않게, 불변 2) */}
          <td>{t.collect_error_kind ? (t.last_checked_ok_at ? `${when(t.last_checked_ok_at)}(성공)` : <span className="board-warn">성공한 확인 없음</span>)
            : t.read_at ? when(t.read_at) : <span className="muted">기록 없음</span>}</td>
          <td><form action={toggleHidden}>
            <input type="hidden" name="id" value={t.id} /><input type="hidden" name="hide" value={t.hidden_at ? "0" : "1"} /><input type="hidden" name="from" value={from} />
            <button className="btn btn-sm" type="submit" aria-label={`${name} ${action}`}>{action}</button>
          </form></td>
        </tr>
      ); })}</tbody>
    </table>
  );
}
