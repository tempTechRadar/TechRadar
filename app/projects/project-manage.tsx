import { PROJECT_MEMO_MAX, PROJECT_NAME_MAX } from "@/lib/domain/project-edit";
import { archiveProjectAction, editProjectAction } from "./project-actions";

// 저장소 프로젝트 하나의 이름·메모 고치기와 보관(PRD-F4), 레포 상세 머리의 [이름·메모 고치기] · [보관](P-12k K2). "프로젝트 밖(내 컴퓨터)"에는 그리지 않는다(이름이 코드에서 상수로 쓰임).
// 둘 다 펼쳐서 쓴다. 보관은 두 단계: 펼쳐 무슨 일이 생기는지 읽고 한 번 더 눌러야 한다(스크립트 없이 키보드·화면 읽기로도 된다). 고친 뒤엔 이 레포 상세(from), 보관 뒤엔 보드로.
export type ManageProject = { id: string; name: string; memo: string | null };

export function ProjectManage({ project }: { project: ManageProject }) {
  return (
    <>
      <details className="repo-tool">
        <summary className="btn btn-sm">이름·메모 고치기</summary>
        <form action={editProjectAction} className="add-row">
          <input type="hidden" name="id" value={project.id} /><input type="hidden" name="from" value={project.id} />
          <label>이름(최대 {PROJECT_NAME_MAX}자) <input name="name" required defaultValue={project.name} size={24} autoComplete="off" /></label>
          <label>메모(최대 {PROJECT_MEMO_MAX}자, 비워도 돼요) <input name="memo" defaultValue={project.memo ?? ""} size={32} autoComplete="off" /></label>
          <button className="btn btn-sm btn-primary" type="submit">고치기</button>
        </form>
      </details>
      <details className="repo-tool">
        <summary className="btn btn-sm">보관</summary>
        <p>보관하면 이 레포의 항목이 보드 · 지도에서 빠지고, 이 레포에서만 쓰던 항목의 새 알림도 더는 오지 않아요. 이미 온 알림과 판단 기록은 그대로 남고, 지우지 않아서 보드의 &quot;보관함&quot;에서 언제든 되살릴 수 있어요.</p>
        <form action={archiveProjectAction}>
          <input type="hidden" name="id" value={project.id} />
          <button className="btn btn-sm btn-danger" type="submit">정말 보관하기</button>
        </form>
      </details>
    </>
  );
}
