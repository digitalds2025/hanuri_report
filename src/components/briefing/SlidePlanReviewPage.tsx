import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Database, Eye, Layers, Loader2, Sparkles, Target } from "lucide-react";
import type { BriefingSlidePlan, SlideContextSet, StoryPhase } from "../../lib/briefingMaterialTypes";
import { SLIDE_LAYOUT_OPTIONS } from "../../lib/briefingMaterialTypes";
import { planToPreviewSlide } from "../../lib/briefingSlidePlanning";
import { syncPlanDerivedFields } from "../../lib/briefingSlidePlanNormalize";
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

  function commitPlan(index: number, patch: Partial<BriefingSlidePlan>) {
    const merged = { ...plans[index], ...patch };
    const next = [...plans];
    next[index] = syncPlanDerivedFields(merged as BriefingSlidePlan);
    onPlansChange(next);
  }

  function updateContextSet(planIndex: number, setIndex: number, patch: Partial<SlideContextSet>) {
    const sets = [...plans[planIndex].contextSets];
    sets[setIndex] = { ...sets[setIndex], ...patch };
    commitPlan(planIndex, { contextSets: sets });
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
    commitPlan(index, {
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
            슬라이드마다 <strong>Hero Fact</strong> · <strong>Context 3세트(현상→분석)</strong> ·{" "}
            <strong>Action Strategy</strong>를 확인·수정한 뒤 제작하세요.
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
          const hero = plan.heroFact;
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
                    {hero?.metricValue ? ` · ${hero.metricValue}` : plan.heroMetric?.value ? ` · ${plan.heroMetric.value}` : ""}
                    {plan.contextSets?.length ? ` · Context ${plan.contextSets.length}세트` : ""}
                  </p>
                </div>
                {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {open ? (
                <div className="grid gap-0 border-t lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)]">
                  <div className="space-y-4 px-5 py-4 text-sm lg:border-r">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      슬라이드 기획 (3단 구조)
                    </p>
                    <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                      {PHASE_LABELS[phase]}
                    </span>

                    <label className="block">
                      <span className="font-bold text-slate-700">슬라이드 제목</span>
                      <input
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        value={plan.title}
                        onChange={(e) => commitPlan(i, { title: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="font-bold text-slate-700">목적 (1슬라이드 1메시지)</span>
                      <textarea
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        rows={2}
                        value={plan.purpose}
                        onChange={(e) => commitPlan(i, { purpose: e.target.value })}
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
                          onChange={(e) => commitPlan(i, { visualHint: e.target.value })}
                        />
                      </label>
                    </div>

                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                      <p className="text-xs font-bold text-indigo-800">① Hero Fact & Metric</p>
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-sm font-bold"
                        value={hero?.headline ?? ""}
                        placeholder="고유명사 + 수치 한 줄 (예: 백운중 학생수 687명)"
                        onChange={(e) =>
                          commitPlan(i, {
                            heroFact: { ...hero, headline: e.target.value, properNouns: hero?.properNouns ?? [] },
                          })
                        }
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          className="rounded-lg border px-3 py-2"
                          value={hero?.metricValue ?? ""}
                          placeholder="수치"
                          onChange={(e) =>
                            commitPlan(i, {
                              heroFact: { ...hero, headline: hero?.headline ?? "", properNouns: hero?.properNouns ?? [], metricValue: e.target.value },
                            })
                          }
                        />
                        <input
                          className="rounded-lg border px-3 py-2"
                          value={hero?.metricLabel ?? ""}
                          placeholder="수치 라벨"
                          onChange={(e) =>
                            commitPlan(i, {
                              heroFact: { ...hero, headline: hero?.headline ?? "", properNouns: hero?.properNouns ?? [], metricLabel: e.target.value },
                            })
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <span className="flex items-center gap-1 font-bold text-slate-700">
                        <Database size={14} /> 수집 데이터 (fact 그라운딩)
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

                    <div>
                      <span className="font-bold text-slate-700">② Context Body (현상 → 분석 → 화면키워드)</span>
                      <p className="mt-0.5 text-[11px] text-slate-500">최소 3세트 · TABLE/METRIC/CHART에 매핑</p>
                      <div className="mt-2 space-y-3">
                        {(plan.contextSets ?? []).map((set, si) => (
                          <div key={si} className="rounded-lg border bg-slate-50 p-3 space-y-2">
                            <p className="text-xs font-bold text-slate-500">세트 {si + 1}</p>
                            <textarea
                              className="w-full rounded-lg border px-2 py-1.5 text-xs"
                              rows={2}
                              value={set.phenomenon}
                              placeholder="현상 (fact·학교명·수치)"
                              onChange={(e) => updateContextSet(i, si, { phenomenon: e.target.value })}
                            />
                            <textarea
                              className="w-full rounded-lg border px-2 py-1.5 text-xs"
                              rows={2}
                              value={set.analysis}
                              placeholder="분석 (학부모 관점)"
                              onChange={(e) => updateContextSet(i, si, { analysis: e.target.value })}
                            />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input
                                className="rounded-lg border px-2 py-1.5 text-xs font-bold"
                                value={set.screenKeyword}
                                placeholder="화면 키워드/수치"
                                onChange={(e) => updateContextSet(i, si, { screenKeyword: e.target.value })}
                              />
                              <input
                                className="rounded-lg border px-2 py-1.5 text-xs"
                                value={set.screenDetail ?? ""}
                                placeholder="TABLE 보조 셀"
                                onChange={(e) => updateContextSet(i, si, { screenDetail: e.target.value })}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <label className="block">
                      <span className="flex items-center gap-1 font-bold text-slate-700">
                        <Target size={14} /> ③ Action Strategy
                      </span>
                      <textarea
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        rows={3}
                        value={plan.actionStrategy}
                        onChange={(e) => commitPlan(i, { actionStrategy: e.target.value })}
                      />
                    </label>

                    <label className="block">
                      <span className="font-bold text-slate-700">컨설턴트 인사이트</span>
                      <textarea
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        rows={2}
                        value={plan.consultantInsight ?? ""}
                        onChange={(e) => commitPlan(i, { consultantInsight: e.target.value })}
                      />
                    </label>

                    <label className="block">
                      <span className="font-bold text-slate-700">통합 기획서 (자동 생성)</span>
                      <textarea
                        className="mt-1 w-full rounded-lg border px-3 py-2 leading-relaxed bg-slate-50"
                        rows={6}
                        readOnly
                        value={getSlideContentPlan(plan)}
                      />
                    </label>

                    <label className="block">
                      <span className="font-bold text-slate-700">
                        발표 멘트 (구어체 · 수치·fact 원문)
                      </span>
                      <textarea
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        rows={5}
                        value={plan.speakerNotes}
                        onChange={(e) => commitPlan(i, { speakerNotes: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="bg-slate-100 p-4 lg:sticky lg:top-4 lg:self-start">
                    <p className="mb-3 flex items-center gap-1 text-xs font-bold text-indigo-800">
                      <Eye size={14} />
                      레이아웃 미리보기
                    </p>
                    <p className="mb-3 text-[11px] text-slate-500">
                      {plan.recommendedLayout} · contextSets 기반 화면 매핑
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
