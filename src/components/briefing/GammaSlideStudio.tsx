import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Layers,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from "lucide-react";
import type { BriefingLayoutSlide, GuardrailReport } from "../../lib/briefingMaterialTypes";
import {
  markdownToSlide,
  slideToEditableMarkdown,
} from "../../lib/briefing/slideMarkdownEditor";
import type { LocalEduTokenLedger } from "../../lib/localEdu/tokenUsage";
import { TokenUsagePanel } from "./TokenUsagePanel";
import { SlideRenderer } from "./SlideRenderer";

type GammaSlideStudioProps = {
  title: string;
  slides: BriefingLayoutSlide[];
  onSlidesChange: (slides: BriefingLayoutSlide[]) => void;
  guardrail?: GuardrailReport | null;
  tokenLedger?: LocalEduTokenLedger | null;
  isGenerating?: boolean;
  generateStatus?: string | null;
  generateError?: string | null;
  busyExport?: boolean;
  onExportPptx: () => void | Promise<void>;
  onExportBundle: () => void | Promise<void>;
  onBack?: () => void;
  onRetry?: () => void;
};

export function GammaSlideStudio({
  title,
  slides,
  onSlidesChange,
  guardrail = null,
  tokenLedger = null,
  isGenerating = false,
  generateStatus = null,
  generateError = null,
  busyExport = false,
  onExportPptx,
  onExportBundle,
  onBack,
  onRetry,
}: GammaSlideStudioProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [markdown, setMarkdown] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const activeSlide = slides[activeIndex];

  useEffect(() => {
    if (activeSlide) {
      setMarkdown(slideToEditableMarkdown(activeSlide));
      setParseError(null);
    }
  }, [activeIndex, activeSlide]);

  useEffect(() => {
    if (activeIndex >= slides.length && slides.length > 0) {
      setActiveIndex(slides.length - 1);
    }
  }, [activeIndex, slides.length]);

  const applyMarkdown = useCallback(
    (md: string) => {
      setMarkdown(md);
      if (!activeSlide) return;
      try {
        const updated = markdownToSlide(md, activeSlide);
        const next = [...slides];
        next[activeIndex] = updated;
        onSlidesChange(next);
        setParseError(null);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "마크다운 파싱 오류");
      }
    },
    [activeSlide, activeIndex, slides, onSlidesChange],
  );

  const slideLabels = useMemo(
    () =>
      slides.map((s, i) => {
        const t = typeof s.title === "string" ? s.title : "";
        return t.slice(0, 24) || `슬라이드 ${i + 1}`;
      }),
    [slides],
  );

  if (isGenerating) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-slate-100 px-6">
        <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
        <p className="mt-6 text-lg font-bold text-slate-800">슬라이드 조립 중…</p>
        <p className="mt-2 text-sm text-slate-500">완료되면 Gamma 스타일 편집 화면이 열립니다</p>
        {generateStatus ? (
          <p className="mt-4 max-w-md text-center text-xs text-indigo-600">{generateStatus}</p>
        ) : null}
      </div>
    );
  }

  if (slides.length === 0 && generateError) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-slate-100 px-6">
        <p className="text-lg font-bold text-red-700">슬라이드 생성에 실패했습니다</p>
        <p className="mt-3 max-w-lg rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {generateError}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              다시 시도
            </button>
          ) : null}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              주제 선택으로
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-slate-100">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Layers size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black text-slate-900 sm:text-base">{title}</h1>
            <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              Gamma 스타일 · 마크다운 편집
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {guardrail ? (
            <span
              className={
                guardrail.passed
                  ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700"
                  : "rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800"
              }
            >
              {guardrail.passed ? "검수 OK" : `검수 ${guardrail.issues.length}건`}
            </span>
          ) : null}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              이전
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void onExportPptx()}
            disabled={busyExport || slides.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busyExport ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            PPTX보내기
          </button>
          <button
            type="button"
            onClick={() => void onExportBundle()}
            disabled={busyExport || slides.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
          >
            <FileText size={14} />
            전체 패키지
          </button>
        </div>
      </header>

      {tokenLedger ? (
        <div className="border-b bg-white px-4 py-2 sm:px-6">
          <TokenUsagePanel ledger={tokenLedger} highlight="slideProduction" />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 슬라이드 캔버스 */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b bg-white/80 px-4 py-2">
            <button
              type="button"
              disabled={activeIndex === 0}
              onClick={() => setActiveIndex((i) => i - 1)}
              className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-bold text-slate-700">
              {activeIndex + 1} / {slides.length}
              {activeSlide?.type ? (
                <span className="ml-2 text-xs font-normal text-slate-400">{activeSlide.type}</span>
              ) : null}
            </span>
            <button
              type="button"
              disabled={activeIndex >= slides.length - 1}
              onClick={() => setActiveIndex((i) => i + 1)}
              className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronRight size={20} />
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="편집 패널"
            >
              {panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
          </div>

          <div className="briefing-scrollbar flex-1 overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto aspect-video max-h-[min(56vh,520px)] w-full max-w-5xl">
              <SlideRenderer slide={activeSlide} />
            </div>

            <div className="mx-auto mt-8 max-w-5xl">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-black tracking-widest text-slate-400 uppercase">
                <Sparkles size={10} className="text-indigo-500" />
                슬라이드 필름스트립
              </p>
              <div className="briefing-scrollbar flex gap-3 overflow-x-auto pb-2">
                {slides.map((slide, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg border-2 transition-all sm:w-44 ${
                      activeIndex === idx
                        ? "border-indigo-600 shadow-lg ring-2 ring-indigo-200"
                        : "border-white hover:border-indigo-200"
                    }`}
                  >
                    <div
                      className="pointer-events-none absolute inset-0 origin-top-left scale-[0.18]"
                      style={{ width: "555%", height: "555%" }}
                    >
                      <SlideRenderer slide={slide} />
                    </div>
                    <span className="absolute bottom-1 left-1 rounded bg-slate-900/75 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      {idx + 1}
                    </span>
                    <span className="absolute top-1 right-1 max-w-[80%] truncate rounded bg-white/90 px-1 text-[8px] text-slate-600">
                      {slideLabels[idx]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 마크다운 편집 패널 */}
        <aside
          className={`flex w-full flex-col border-t border-slate-200 bg-white lg:w-[min(420px,38vw)] lg:border-t-0 lg:border-l ${
            panelOpen ? "" : "hidden lg:flex"
          }`}
        >
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-bold text-slate-800">슬라이드 편집 (Markdown)</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              <code className="rounded bg-slate-100 px-1">## 화면</code>,{" "}
              <code className="rounded bg-slate-100 px-1">## 발표 멘트</code>,{" "}
              <code className="rounded bg-slate-100 px-1">## 강사 인사이트</code> 섹션을 수정하면
              왼쪽 슬라이드에 즉시 반영됩니다.
            </p>
          </div>
          <textarea
            value={markdown}
            onChange={(e) => applyMarkdown(e.target.value)}
            className="briefing-scrollbar min-h-[280px] flex-1 resize-none border-0 bg-slate-950 p-4 font-mono text-[13px] leading-relaxed text-slate-200 outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/40 lg:min-h-0"
            spellCheck={false}
            placeholder={"---\nlayout: BULLETS\n---\n\n# 제목\n\n## 화면 (Slide Text)\n- 항목"}
          />
          {parseError ? (
            <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
              {parseError}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
