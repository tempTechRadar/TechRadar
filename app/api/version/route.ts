// 지금 운영에 올라간 커밋(Vercel이 빌드할 때 넣는 값). GitHub Actions 배포(deploy-production)가 "운영 뒤로 앱 코드가 바뀌었는지"를 이것과 비교한다(ADR 0023).
// 공개 저장소의 커밋 번호라 숨길 것이 없다. 빌드 때 정해지는 값이라 정적으로 둔다.
export const dynamic = "force-static";

export function GET() {
  return Response.json({ sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
}
