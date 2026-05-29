import type { ReactNode } from "react";

type Props = {
  label: string;
  description: ReactNode;
  variant: "high" | "low";
};

const GAUGE_BADGE_PILL = {
  high: { bg: "#f0fdfa", border: "#99f6e4", color: "#134e4a" },
  low: { bg: "#fff1f2", border: "#fecdd3", color: "#9f1239" },
} as const;

/** 반기 레포트 — 집중 성취 / 향후 강화 반원 게이지 (라벨은 호 안쪽 하단, PDF 캡처용 고정색) */
export function HalfYearGauge({ label, description, variant }: Props) {
  const stroke = variant === "high" ? "#14b8a6" : "#fb7185";
  const fill = variant === "high" ? "#ccfbf1" : "#ffe4e6";

  return (
    <div className="flex w-full min-w-0 flex-col items-center text-center">
      <div className="relative mx-auto h-28 w-44 shrink-0">
        <svg viewBox="0 0 200 110" className="block h-full w-full" aria-hidden>
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={stroke}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray="251"
            strokeDashoffset={variant === "high" ? "40" : "120"}
          />
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill={fill} fillOpacity={0.45} />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center">
          <span
            data-report-capture-badge
            className="whitespace-nowrap"
            style={{
              display: "inline-block",
              boxSizing: "border-box",
              padding: "3px 10px",
              borderRadius: 9999,
              border: `1px solid ${GAUGE_BADGE_PILL[variant].border}`,
              backgroundColor: GAUGE_BADGE_PILL[variant].bg,
              color: GAUGE_BADGE_PILL[variant].color,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: "13px",
              textAlign: "center",
            }}
          >
            {label}
          </span>
        </div>
      </div>
      <div className="w-full min-w-0 text-[15px] leading-relaxed text-gray-700">{description}</div>
    </div>
  );
}
