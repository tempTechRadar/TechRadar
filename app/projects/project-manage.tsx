import { PROJECT_MEMO_MAX, PROJECT_NAME_MAX } from "@/lib/domain/project-edit";
import { archiveProjectAction, editProjectAction } from "./project-actions";

// 저장소 프로젝트 하나의 이름·메모 고치기와 보관(PRD-F4). "프로젝트 밖(내 컴퓨터)"에는 그리지 않는다(이름이 코드에서 상수로 쓰임).
// 보관은 두 단계다: 펼쳐서 무슨 일이 생기는지 읽고 한 번 더 눌러야 한다(스크립트 없이 키보드·화면 읽기로도 된다).
export type ManageProject = { id: string; name: string; memo: string | null };

export function ProjectManage({ project }: { project: ManageProject }) {
  return (
    <details className="card">
      <summary>프로젝트 관리: {project.name}</summary>
      {project.memo && <p className="muted">메모: {project.memo}</p>}
      <form action={editProjectAction} className="filters" style={{ alignItems: "end" }}>
        <input type="hidden" name="id" value={project.id} />
        <label>
          이름 (최대 {PROJECT_NAME_MAX}자)
          <input name="name" required defaultValue={project.name} size={30} autoComplete="off" />
        </label>
        <label>
          메모 (최대 {PROJECT_MEMO_MAX}자, 비워도 돼요)
          <input name="memo" defaultValue={project.memo ?? ""} size={40} autoComplete="off" />
        </label>
        <button className="btn" type="submit">이름·메모 고치기</button>
      </form>
      <details>
        <summary>보관하기</summary>
        <p>보관하면 이 프로젝트의 기술이 내 기술 목록·지도에서 빠지고, 이 프로젝트에서만 쓰던 기술의 새 알림도 더는 오지 않아요. 이미 온 알림과 판단 기록은 그대로 남고, 지우지는 않아서 아래 "보관한 프로젝트"에서 언제든 되살릴 수 있어요.</p>
        <form action={archiveProjectAction}>
          <input type="hidden" name="id" value={project.id} />
          <button className="btn" type="submit">정말 보관하기</button>
        </form>
      </details>
    </details>
  );
}
