// 관측소 로봇(레이더 접시 머리, 자체 그림): 청사진 가이드(P-12s) · 지도 찾기 도우미(P-12w)가 같이 쓴다. 모양 · 움직임 CSS는 app/blueprint/guide.css(guide-bot …).
// hop이 바뀌면 살짝 뛴다(새 답), 움직임 줄이기면 멈춤
export function Bot({ hop }: { hop: number }) {
  return (
    <svg key={hop} className="guide-bot" data-hop={hop ? "" : undefined} viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <path className="guide-dish" d="M10 15 A14 9 0 0 0 38 15 Z" />
      <line x1="24" y1="15" x2="24" y2="6" className="guide-mast" /><circle cx="24" cy="5" r="2.4" className="guide-beacon" />
      <rect x="12" y="17" width="24" height="20" rx="8" className="guide-body" />
      <circle cx="19.5" cy="26" r="2.6" className="guide-eye" /><circle cx="28.5" cy="26" r="2.6" className="guide-eye" />
      <path d="M20 31.5 Q24 34 28 31.5" className="guide-mouth" />
      <rect x="17" y="37" width="4" height="5" rx="2" className="guide-body" /><rect x="27" y="37" width="4" height="5" rx="2" className="guide-body" />
    </svg>
  );
}
