"use client";
// 관리자 지정 · 되돌리기 입력 창(작업 I-P-admin-revoke). 표 칸 안에서 폼을 펼치면 칸 너비·높이가 바뀌어 표 전체가 흔들렸다(사용자 지적 11-23).
// 그래서 칸에는 버튼만 두고, 사유·확인 체크는 표 위에 뜨는 대화상자(<dialog>)에서 받는다. 보내기는 그대로 서버 동작(actions.ts → DB 함수)이고,
// 확인 체크와 사유는 서버·DB가 다시 본다(이 화면만 믿지 않음, 불변 5).
import { useId, useRef } from "react";

type Props = {
  memberId: string;
  nickname: string;
  action: (form: FormData) => Promise<void>;
  label: string; // 버튼과 보내기 단추 글
  title: string; // 대화상자 제목
  confirm: string; // 확인 체크 문장
  danger?: boolean; // 되돌리기처럼 권한을 거두는 쪽
};

export function RoleDialog({ memberId, nickname, action, label, title, confirm, danger }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button type="button" className={`role-open${danger ? " danger" : ""}`} onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog ref={ref} className="role-dialog" aria-labelledby={`${id}-t`}>
        <form action={action} className="role-form">
          <h2 id={`${id}-t`}>{title}</h2>
          <p className="muted">대상: <b>{nickname}</b></p>
          <input type="hidden" name="id" value={memberId} />
          <label className="role-reason">
            사유(5~300자, 바꾼 기록에 담당자·시각과 함께 남아요)
            <input name="reason" required minLength={5} maxLength={300} autoComplete="off" placeholder="예: 운영 점검을 함께 맡기로 함" />
          </label>
          <label className="role-check">
            <input type="checkbox" name="confirm" value="yes" required />
            <span>{confirm}</span>
          </label>
          <div className="role-actions">
            <button type="button" onClick={() => ref.current?.close()}>취소</button>
            <button type="submit" className={danger ? "danger" : "primary"}>{label}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
