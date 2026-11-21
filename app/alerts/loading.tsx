// 화면을 읽는 동안 뼈대(P-12f ④ 화면 일관성). 이 경로는 로그인 전에도 보내지 않고 그 자리 안내라 뼈대를 먼저 보내도 된다
import { PageSkeleton } from "../page-skeleton";

export default function Loading() {
  return <PageSkeleton title="알림" />;
}
