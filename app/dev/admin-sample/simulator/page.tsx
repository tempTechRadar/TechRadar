// 개발 컴퓨터(next dev)에서만: 시뮬레이터 화면을 로그인 없이 관리자 틀 안에서 눈으로 보는 견본. 배포에서는 404
import { notFound } from "next/navigation";
import { SimulatorBody } from "../../../admin/simulator/body";
export default function SimulatorSample() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SimulatorBody info="(견본) 가짜 변경 1건을 만들었어요. 시연 계정 알림 1건." run="00000000-0000-4000-8000-000000000301" />;
}
