import { ownText, TECH_ERROR_TEXT } from "@/lib/domain/my-tech-view";
import { PROJECT_ERROR_TEXT, PROJECT_NOTICE_TEXT } from "@/lib/domain/project-edit";
import { registerProject } from "../projects/actions";

// 레포 동작 결과 알림(보드 맨 위 · 레포 상세 맨 위)과 레포 등록 한 줄. 옛 "레포 관리 · 내 기술" 큰 표(P-12i D3)는 K2에서 레포 상세 /projects/[id]로 옮겨 지움:
// 내 기술 표 · 숨기기 · 이름 · 메모 · 보관은 레포 상세, 되살리기는 보드 보관함, 등록은 "진행 중 프로젝트" 판, 직접 추가(PRD-F7)는 "직접 추가" 판.
// 등록 · 숨기기 등의 결과는 주소 ?error= · ?notice=로 오고, 보드 맨 위 ManageNotices가 말한다(아래에 있어도 놓치지 않게).
export type ManageQuery = { error?: string; notice?: string; audit?: string; q?: string };

const NOTICE_TEXT: Record<string, string> = { hidden: "숨겼어요. 다시 읽어도 되살아나지 않아요.", restored: "되돌렸어요.", added: "목록에 추가했어요.", ...PROJECT_NOTICE_TEXT };
const URL_ERROR_TEXT: Record<string, string> = {
  url: "GitHub 저장소 주소(https://github.com/owner/repo)를 넣어 주세요.",
  repo: "이 저장소를 열 수 없어요. 주소가 틀렸거나 비공개일 수 있어요. 공개 GitHub 저장소만 등록할 수 있어요.",
  ...PROJECT_ERROR_TEXT,
};

/** 등록 · 숨기기 · 보관 등의 결과 알림(주소에서 온 코드는 자기 키만 문구로: __proto__로 500이 나지 않게) */
export function ManageNotices({ query }: { query: ManageQuery }) {
  const errorText = ownText(URL_ERROR_TEXT, query.error) ?? ownText(TECH_ERROR_TEXT, query.error);
  const noticeText = ownText(NOTICE_TEXT, query.notice);
  return (
    <>
      {errorText && <p className="notice notice-error" role="alert">{errorText}</p>}
      {noticeText && <p className="notice notice-ok" role="status">{noticeText}</p>}
      {query.audit === "0" && <p className="notice notice-error" role="alert">바뀐 것은 저장됐지만 &quot;누가·언제 바꿨는지&quot; 기록을 남기지 못했어요. 팀에 알려 주세요.</p>}
    </>
  );
}

/** 레포 등록 한 줄("진행 중 프로젝트" 판 맨 아래, 같은 주소를 다시 넣으면 다시 읽기). 읽는 파일 목록은 칸 설명(title)으로 */
export function RegisterForm() {
  return (
    <form action={registerProject} className="add-row repo-register" id="repo-register"
      title="package.json, requirements.txt, .mcp.json, .claude/skills와 Cursor · VS Code · Gemini CLI의 MCP 설정에서 AI 코딩 도구만 읽어요. 이미 등록한 주소를 다시 넣으면 다시 읽어요.">
      <label>+ 레포 등록 <input name="repoUrl" type="url" required placeholder="https://github.com/owner/repo (공개 저장소)" size={36} /></label>
      <button className="btn btn-sm btn-primary" type="submit">등록하고 읽기</button>
    </form>
  );
}
