// 사용기 신고의 고치기 폼(P-24 24b). 사유를 꼭 받고, 서버 동작이 관리자 확인·검사·기록을 맡는다. 자바스크립트 없이도 동작하는 기본 폼.
import { handleReportsAction, hideNoteAction, unhideNoteAction } from "./actions";

const BTN = { minHeight: "var(--hit)", minWidth: "var(--hit)" } as const;
const ROW = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 } as const;

function Reason({ id }: { id: string }) {
  return (
    <label>
      사유 <input name="reason" id={id} required minLength={5} maxLength={300} placeholder="왜 바꾸는지 5자 이상" style={{ minHeight: "var(--hit)", minWidth: 240 }} />
    </label>
  );
}

/** 보이는 글: 숨기기(신고도 함께 처리함) + 필요하면 신고만 처리함. 같은 사유 칸 하나를 두 버튼이 나눠 쓴다 */
export function VisibleNoteForm({ id, hasPending }: { id: string; hasPending: boolean }) {
  return (
    <form style={ROW} aria-label="글 숨기기">
      <input type="hidden" name="id" value={id} />
      <Reason id={`reason-${id}`} />
      <button type="submit" formAction={hideNoteAction} style={BTN} className="danger">글 숨기기</button>
      {hasPending ? <button type="submit" formAction={handleReportsAction} style={BTN}>신고만 처리함으로 (글은 그대로)</button> : null}
    </form>
  );
}

/** 숨긴 글: 숨김 풀기 + 필요하면 신고 처리함 */
export function HiddenNoteForm({ id, hasPending }: { id: string; hasPending: boolean }) {
  return (
    <form style={ROW} aria-label="숨김 풀기">
      <input type="hidden" name="id" value={id} />
      <Reason id={`reason-${id}`} />
      <button type="submit" formAction={unhideNoteAction} style={BTN}>숨김 풀기</button>
      {hasPending ? <button type="submit" formAction={handleReportsAction} style={BTN}>신고 처리함으로</button> : null}
    </form>
  );
}
