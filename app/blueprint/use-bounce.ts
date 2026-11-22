"use client";
// 반동 자동 정렬(P-12h S3): 판은 바로 바꾸고(되돌리기 · 초안이 정확) 화면의 단계만 그 자리로 약 450ms 튕겨 간다(easeOutBack).
// 끌기 · 되돌리기 · 다른 바꾸기 · 언마운트면 stop. 움직임 줄이기(calm)면 부르는 쪽이 start를 안 부른다
import { useCallback, useEffect, useRef, useState } from "react";
import type { Pos } from "@/lib/blueprint/graph";
import { easeOutBack, tween } from "@/lib/blueprint/tween";

const BOUNCE_MS = 450;

export function useBounce() {
  const [at, setAt] = useState<Map<string, Pos> | null>(null); // 지금 화면에 그릴 자리(null = 판 그대로)
  const frame = useRef(0);
  const stop = useCallback(() => { cancelAnimationFrame(frame.current); frame.current = 0; setAt(null); }, []);
  const start = useCallback((from: Map<string, Pos>, to: Map<string, Pos>, onEnd: () => void) => {
    cancelAnimationFrame(frame.current);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = (now - t0) / BOUNCE_MS;
      if (t >= 1) { frame.current = 0; setAt(null); onEnd(); return; }
      setAt(tween(from, to, easeOutBack(t)));
      frame.current = requestAnimationFrame(step);
    };
    setAt(from);
    frame.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return { at, start, stop };
}
