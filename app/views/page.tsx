// 옛 보드(/views): P-12f(사용자 결정)에서 지도의 판단 칩과 청사진 하단 패널 "후보" 탭으로 녹였다. 옛 링크는 새 자리로 보낸다(lib/nav/moved.ts)
import { redirect } from "next/navigation";
import { viewsTarget } from "@/lib/nav/moved";

export default async function ViewsMoved({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  redirect(viewsTarget((await searchParams).tab));
}
