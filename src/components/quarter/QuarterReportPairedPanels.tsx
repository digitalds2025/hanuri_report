import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ReportSectionRibbon } from "../reports/ReportSection";
import {
  REPORT_PAIRED_PANELS_GRID_CLASS,
  REPORT_SECTION_PANEL_CLASS,
  reportSectionPaddingStyle,
} from "../../lib/reportLayout";

type QuarterReportPairedPanelsProps = {
  leftTitle: string;
  rightTitle: string;
  left: ReactNode;
  right: ReactNode;
  /** 콘텐츠·이미지 변경 시 흰 박스 높이 재계산 */
  measureKey?: string;
};

/**
 * 분기 레포트 — 타이틀은 1행(위 정렬), 흰 본문 박스는 2행에서 좌·우 높이만 동기화(더 긴 쪽).
 */
export function QuarterReportPairedPanels({
  leftTitle,
  rightTitle,
  left,
  right,
  measureKey = "",
}: QuarterReportPairedPanelsProps) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [panelHeightPx, setPanelHeightPx] = useState<number | undefined>(undefined);

  const remeasure = useCallback(() => {
    const l = leftRef.current;
    const r = rightRef.current;
    if (!l || !r) return;
    l.style.height = "";
    r.style.height = "";
    const next = Math.max(l.offsetHeight, r.offsetHeight);
    if (next > 0) setPanelHeightPx(next);
  }, []);

  useLayoutEffect(() => {
    remeasure();
    const ro = new ResizeObserver(() => remeasure());
    if (leftRef.current) ro.observe(leftRef.current);
    if (rightRef.current) ro.observe(rightRef.current);
    const onLoad = () => remeasure();
    window.addEventListener("load", onLoad);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", onLoad);
    };
  }, [remeasure, measureKey]);

  const panelStyle: CSSProperties | undefined =
    panelHeightPx != null
      ? { height: panelHeightPx, boxSizing: "border-box", ...reportSectionPaddingStyle() }
      : reportSectionPaddingStyle();

  return (
    <div className={REPORT_PAIRED_PANELS_GRID_CLASS}>
      <ReportSectionRibbon title={leftTitle} className="col-start-1 row-start-1 self-start" />
      <ReportSectionRibbon title={rightTitle} className="col-start-2 row-start-1 self-start" />

      <div
        ref={leftRef}
        className={`${REPORT_SECTION_PANEL_CLASS} col-start-1 row-start-2 flex flex-col items-stretch`}
        style={panelStyle}
      >
        <div className="min-h-0 shrink-0">{left}</div>
      </div>

      <div
        ref={rightRef}
        className={`${REPORT_SECTION_PANEL_CLASS} col-start-2 row-start-2 flex flex-col items-stretch overflow-hidden`}
        style={panelStyle}
      >
        <div className="flex min-h-0 flex-1 flex-col">{right}</div>
      </div>
    </div>
  );
}
