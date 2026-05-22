import { useEffect, useRef, useState } from "react";
import type { BriefingLayoutSlide } from "../../lib/briefingMaterialTypes";
import { SlideRenderer } from "./SlideRenderer";

/** PowerPoint 표준 16:9 (13.333×7.5 in → 960×540 px @ 72dpi 근사) */
export const SLIDE_STAGE_WIDTH = 960;
export const SLIDE_STAGE_HEIGHT = 540;

type SlideScaledPreviewProps = {
  slide: BriefingLayoutSlide | null | undefined;
};

/**
 * 실제 슬라이드 16:9 비율 유지 + 컨테이너 너비에 맞춰 전체(텍스트·아이콘 포함) 비례 축소
 */
export function SlideScaledPreview({ slide }: SlideScaledPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / SLIDE_STAGE_WIDTH);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-xl border-2 border-slate-300 bg-slate-800 shadow-inner"
      style={{ aspectRatio: `${SLIDE_STAGE_WIDTH} / ${SLIDE_STAGE_HEIGHT}` }}
    >
      <div
        className="pointer-events-none absolute left-0 top-0"
        style={{
          width: SLIDE_STAGE_WIDTH,
          height: SLIDE_STAGE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <SlideRenderer slide={slide} stage />
      </div>
    </div>
  );
}
