import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Database, Eye, Layers, Loader2, Sparkles } from "lucide-react";
import type { BriefingSlidePlan, ScreenChunk, StoryPhase } from "../../lib/briefingMaterialTypes";
import { SLIDE_LAYOUT_OPTIONS } from "../../lib/briefingMaterialTypes";
import { planToPreviewSlide } from "../../lib/briefingSlidePlanning";
import { getSlideContentPlan } from "../../lib/briefingStorylinePlanning";
import { layoutForContent } from "../../lib/briefingStorylinePlanning";
import type { LocalEduTokenLedger } from "../../lib/localEdu/tokenUsage";
import { SlideScaledPreview } from "./SlideScaledPreview";
import { TokenUsagePanel } from "./TokenUsagePanel";

const PHASE_LABELS: Record<StoryPhase, string> = {
  intro: "도입 · 문제 제기",
  development: "전개 · 데이터 분석",
  climax: "절정 · 해결책",
  closing: "종결 · 행동 유도",
};

type SlidePlanReviewPageProps = {
  topicTitle: string;
  targetSlideCount: number;
  dataAsOf: string;
  plans: BriefingSlidePlan[];
  onPlansChange: (plans: BriefingSlidePlan[]) => void;
  tokenLedger: LocalEduTokenLedger;
  busy: boolean;
  status: string | null;
  error: string | null;
  onProduce: () => void;
  onBack: () => void;
};

export function SlidePlanReviewPage({
  topicTitle,
  targetSlideCount,
  dataAsOf,
  plans,
  onPlansChange,
  tokenLedger,
  busy,
  status,
  error,
  onProduce,
  onBack,
}: SlidePlanReviewPageProps) {
  const [expanded, setExpanded] = useState<number>(0);

  function updatePlan(index: number, patch: Partial<BriefingSlidePlan>) {
    const next = [...plans];
    next[index] = { ...next[index], ...patch };
    onPlansChange(next);
  }

  function updateChunk(planIndex: number, chunkIndex: number, patch: Partial<ScreenChunk>) {
    const p = plans[planIndex];
    const chunks = [...(p.screenChunks ?? [])];
    chunks[chunkIndex] = { ...chunks[chunkIndex], ...patch };
    const keyMessages = chunks.map((c) => (c.sublabel ? `${c.label} · ${c.sublabel}` : c.label));
    updatePlan(planIndex, { screenChunks: chunks, keyMessages, keyPoints: keyMessages });
  }

  function setLayout(index: number, layout: string) {
    const p = plans[index];
    const hintMap: Record<string, string> = {
      METRIC: "big_number",
      CHART_BAR: "chart_bar",
      COMPARISON: "comparison",
      PROCESS_FLOW: "timeline",
      DATA_TABLE: "table",
      CHECKLIST: "checklist",
      ICON_GRID: "icon_grid",
      STAT_GRID: "stat_grid",
      TITLE: "title",
      SECTION_HEADER: "section",
      SOURCES: "sources",
    };
    const { visualHint: auto } = layoutForContent(
      p.blockId,
      p.dataRefs,
      p.storyPhase ?? "development",
    );
    updatePlan(index, {
      recommendedLayout: layout,
      visualHint: hintMap[layout] ?? auto,
    });
  }

  const previewSlide = useMemo(() => {
    if (expanded < 0 || !plans[expanded]) return null;
    return planToPreviewSlide(plans[expanded], dataAsOf);
  }, [expanded, plans, dataAsOf]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600">
            <Layers size={20} />
            <span className="text-xs font-bold uppercase tracking-wide">슬라이드별 기획</span>
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-900">{topicTitle}</h1>
          <p className="mt-2 text-sm text-slate-600">
            요청 <strong>{targetSlideCount}장</strong> · 현재 기획 <strong>{plans.length}장</strong>.
            왼쪽에서 슬라이드 기획을 수정하고, 오른쪽 <strong>레이아웃 미리보기</strong>에서 제작될 화면을
            확인하세요. 화면은 키워드·수치만, 자세한 설명은 <strong>발표 멘트</strong>에 둡니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="rounded-lg border px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          ← 주제 선택
        </button>
      </div>

      {plans.length !== targetSlideCount ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          슬라이드 수가 요청({targetSlideCount}장)과 다릅니다. 기획을 다시 생성하거나 주제 단계에서 장수를
          확인해 주세요.
        </p>
      ) : null}

      <TokenUsagePanel ledger={tokenLedger} highlight="slidePlanning" />

      <div className="space-y-3">
        {plans.map((plan, i) => {
          const open = expanded === i;
          const phase = plan.storyPhase ?? "development";
          return (
            <article
              key={`${plan.slideNumber}-${plan.blockId ?? i}`}
              className="rounded-2xl border bg-white shadow-sm overflow-hidden"
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"
                onClick={() => setExpanded(open ? -1 : i)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-black text-indigo-700">
                  {plan.slideNumber}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 truncate">{plan.title}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {PHASE_LABELS[phase]} · {plan.recommendedLayout}
                    {plan.heroMetric ? ` · ${plan.heroMetric.value}` : ""}
                    {plan.dataRefs.length ? ` · 데이터 ${plan.dataRefs.length}건` : ""}
                  </p>
                </div>
                {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {open ? (
                <div className="grid gap-0 border-t lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)]">
                  <div className="space-y-4 px-5 py-4 text-sm lg:border-r">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      슬라이드 기획
                    </p>
                    <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                      {PHASE_LABELS[phase]}
                    </span>

                    <label className="block">
                      <span className="font-bold text-slate-700">슬라이드 제목</span>
                      <input
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={plan.title}
                        onChange={(e) => updatePlan(i, { title: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="font-bold text-slate-700">목적 (1슬라이드 1메시지)</span>
                      <textarea
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        rows={2}
                        value={plan.purpose}
                        onChange={(e) => updatePlan(i, { purpose: e.target.value })}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="font-bold text-slate-700">레이아웃</span>
                        <select
                          className="mt-1 w-full rounded-lg border px-3 py-2"
                          value={plan.recommendedLayout}
                          onChange={(e) => setLayout(i, e.target.value)}
                        >
                          {SLIDE_LAYOUT_OPTIONS.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="font-bold text-slate-700">시각 유형</span>
                        <input
                          className="mt-1 w-full rounded-lg border px-3 py-2"
                          value={plan.visualHint}
                          onChange={(e) => updatePlan(i, { visualHint: e.target.value })}
                        />
                      </label>
                    </div>

                    {plan.heroMetric ? (
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                        <p className="text-xs font-bold text-indigo-800">화면 빅넘버 (수집 데이터)</p>
                        <p className="mt-1 text-2xl font-black text-indigo-700">{plan.heroMetric.value}</p>
                        <p className="text-sm text-slate-700">{plan.heroMetric.label}</p>
                      </div>
                    ) : null}

                    <div>
                      <span className="flex items-center gap-1 font-bold text-slate-700">
                        <Database size={14} /> 수집 데이터 (발표 멘트·표/차트 근거)
                      </span>
                      <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs">
                        {plan.dataRefs.length === 0 ? (
                          <li className="text-slate-500">매칭된 fact 없음</li>
                        ) : (
                          plan.dataRefs.map((d) => (
                            <li key={d.id} className="border-b border-slate-200 pb-2 last:border-0">
                              <span className="font-bold text-indigo-700">
                                [{d.grade ?? "?"}] {d.category}
                              </span>
                              <p className="mt-0.5 text-slate-600">{d.fact}</p>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>

                    <label className="block">
                      <span className="font-bold text-slate-700">슬라이드 내용 기획</span>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        이 슬라이드에 담을 내용·메시지·수집 데이터 활용 방식 (읽기 쉬운 기획 문장)
                      </p>
                      <textarea
                        className="mt-1 w-full rounded-lg border px-3 py-2 leading-relaxed"
                        rows={5}
                        value={getSlideContentPlan(plan)}
                        onChange={(e) =>
                          updatePlan(i, { slideContentPlan: e.target.value, contentPlan: e.target.value })
                        }
                      />
                    </label>

                    <div>
                      <span className="font-bold text-slate-700">
                        화면 키워드 청크 (3-3 규칙 · 최대 3개, 명사형)
                      </span>
                      <div className="mt-2 space-y-2">
                        {(plan.screenChunks ?? []).map((ch, ci) => (
                          <div key={ci} className="grid gap-2 sm:grid-cols-2">
                            <input
                              className="rounded-lg border px-3 py-2 text-sm font-bold"
                              value={ch.label}
                              placeholder="키워드 / 수치"
                              onChange={(e) => updateChunk(i, ci, { label: e.target.value })}
                            />
                            <input
                              className="rounded-lg border px-3 py-2 text-sm"
                              value={ch.sublabel ?? ""}
                              placeholder="보조 설명 (한 줄)"
                              onChange={(e) => updateChunk(i, ci, { sublabel: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <label className="block">
                      <span className="font-bold text-slate-700">
                        발표 멘트 (구어체 · 수치·fact 원문)
                      </span>
                      <textarea
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        rows={5}
                        value={plan.speakerNotes}
                        onChange={(e) => updatePlan(i, { speakerNotes: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="bg-slate-100 p-4 lg:sticky lg:top-4 lg:self-start">
                    <p className="mb-3 flex items-center gap-1 text-xs font-bold text-indigo-800">
                      <Eye size={14} />
                      레이아웃 미리보기
                    </p>
                    <p className="mb-3 text-[11px] text-slate-500">
                      {plan.recommendedLayout} · 실제 제작 시 아래와 같은 형태로 출력됩니다
                    </p>
                    <SlideScaledPreview slide={previewSlide} />
                    <p className="mt-2 text-center text-[10px] text-slate-400">
                      16:9 · 960×540 기준 비례 축소
                    </p>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {status ? <p className="text-sm text-indigo-600">{status}</p> : null}

      <button
        type="button"
        disabled={busy || plans.length === 0}
        onClick={onProduce}
        className="sticky bottom-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-4 text-sm font-bold text-white shadow-lg disabled:opacity-50"
      >
        {busy ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            슬라이드 제작 중…
          </>
        ) : (
          <>
            <Sparkles size={18} />
            제작하기 · {plans.length}장 Gamma 편집으로
          </>
        )}
      </button>
    </div>
  );
}
