import { ArrowRight } from "lucide-react";
import type { BriefingStorylineBrief } from "../../lib/briefingMaterialTypes";

type BriefingStorylinePanelProps = {
  brief: BriefingStorylineBrief | null;
  loading?: boolean;
  targetSlideCount: number;
};

export function BriefingStorylinePanel({
  brief,
  loading = false,
  targetSlideCount,
}: BriefingStorylinePanelProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5 animate-pulse">
        <p className="text-sm font-bold text-indigo-700">설명회 흐름 기획 생성 중…</p>
        <p className="mt-1 text-xs text-slate-500">주제·목적·{targetSlideCount}장 분량에 맞춰 조정합니다.</p>
      </div>
    );
  }

  if (!brief) return null;

  const phaseSum = brief.phases.reduce((a, p) => a + p.slideCount, 0);

  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
      <h3 className="text-sm font-black text-indigo-900">설명회 자료 흐름 기획</h3>
      <p className="mt-1 text-xs text-slate-600">
        {brief.purposeLabel} · {brief.targetLabel} · 요청{" "}
        <strong className="text-indigo-700">{brief.totalSlides}장</strong>
        {phaseSum !== brief.totalSlides ? (
          <span className="text-amber-700"> (단계 합 {phaseSum}장)</span>
        ) : null}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-800">{brief.overview}</p>

      <div className="mt-4 flex flex-wrap items-center gap-1 text-[10px] font-bold text-slate-500">
        {brief.phases.map((p, i) => (
          <span key={p.phase} className="flex items-center gap-1">
            {i > 0 ? <ArrowRight size={12} className="text-indigo-400" /> : null}
            <span className="rounded-full bg-white px-2 py-1 border text-indigo-800">
              {p.label}
            </span>
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {brief.phases.map((p) => (
          <div
            key={p.phase}
            className="rounded-xl border bg-white p-4 text-sm shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-slate-900">{p.label}</p>
              <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-black text-indigo-700">
                {p.slideCount}장
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-rose-600/90">
              학부모 감정: {p.parentEmotion}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">{p.designTone}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-700">{p.narrative}</p>
            {p.keyActions.length ? (
              <ul className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                {p.keyActions.map((a) => (
                  <li key={a}>· {a}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
