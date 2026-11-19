// 설치 프롬프트·가져오기가 함께 쓰는 모양(SPEC-4.3·6). DB·화면을 모르는 순수 규칙이다. 주인: 차세일(C).

export type ItemKind = "mcp" | "skill" | "plugin" | "sdk";
export type Ecosystem = "npm" | "pypi";
/** 넣을 수 있는 세 출처(SPEC-4.3): 저장소에서 읽음 / 값 검사를 통과한 가져오기 / 공식 레지스트리 이름과 같은 적용 후보 */
export type ItemSource = "repo" | "import" | "candidate";
/** 설정 위치: 프로젝트(.mcp.json, 프로젝트 .claude/skills/) 또는 사용자 범위 */
export type Scope = "project" | "user";

export type InstallItem = {
  kind: ItemKind;
  name: string;
  source: ItemSource;
  ecosystem?: Ecosystem;
  /** 패키지 이름, 스킬은 가져올 곳(github.com/owner/repo/경로) */
  pkg: string;
  version?: string | null;
  scope?: Scope;
  /** 공식 출처 링크(https) */
  link?: string;
  /** 필요한 환경변수의 이름만. 값은 절대 받지 않는다 */
  envKeys?: string[];
  /** 보안 경고에서 고른 것: 이 고친 버전으로 고정한다(ADR 0012) */
  pinTo?: string;
  /** 위험 등급이면 이유와 고친 버전. 어떤 경우에도 프롬프트에 넣지 않는다(ADR 0012, SPEC-4.3) */
  danger?: { reason: string; fixedVersion?: string };
  /** 적용 후보(candidate)일 때 공식 레지스트리에 있는 이름. pkg와 정확히 같아야 넣는다 */
  registryName?: string;
};

export type Excluded = { why: string; label?: string };
