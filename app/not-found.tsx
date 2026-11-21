// 없는 주소 · notFound()(I-P-12d-ui-sweep): Next 기본 영어 404 대신. 지운 것과 남의 것을 같은 말로 알린다(있는지 드러내지 않게, 불변 5)
import Link from "next/link";
import "./alerts/alerts.css";

export const metadata = { title: "찾을 수 없어요 · TechRadar" };

export default function NotFound() {
  return (
    <main className="alerts">
      <h1>찾을 수 없어요</h1>
      <p>주소가 틀렸거나, 지워졌거나, 내가 볼 수 없는 곳이에요.</p>
      <p className="actions"><Link className="btn btn-primary" href="/">기술 지도로 가기</Link></p>
    </main>
  );
}
