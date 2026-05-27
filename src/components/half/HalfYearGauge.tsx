type Props = {
  label: string;
  description: string;
  variant: "high" | "low";
};

/** 반기 레포트 — 집중 성취 / 향후 강화 반원 게이지 (숫자 미노출) */
export function HalfYearGauge({ label, description, variant }: Props) {
  const stroke = variant === "high" ? "#14b8a6" : "#fb7185";
  const fill = variant === "high" ? "rgba(20,184,166,0.15)" : "rgba(251,113,133,0.15)";
  const badge =
    variant === "high"
      ? "bg-teal-50 text-teal-900 ring-teal-200"
      : "bg-rose-50 text-rose-900 ring-rose-200";

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative h-28 w-44">
        <svg viewBox="0 0 200 110" className="h-full w-full" aria-hidden>
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
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill={fill} opacity={0.35} />
        </svg>
        <span
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${badge}`}
        >
          {label}
        </span>
      </div>
      <p className="mt-2 max-w-[220px] text-xs leading-relaxed text-slate-700">{description}</p>
    </div>
  );
}
