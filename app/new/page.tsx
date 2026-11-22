// 옛 새 기술(/new): P-12f(사용자 결정)에서 지도의 "이번 주" 보기(기간 칩)로 합쳤다. 옛 링크는 그 보기로 보낸다
import { redirect } from "next/navigation";
import { NEW_TARGET } from "@/lib/nav/moved";

export default function NewMoved() {
  redirect(NEW_TARGET);
}
