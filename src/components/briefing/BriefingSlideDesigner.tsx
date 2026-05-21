import { useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronRight,
  Edit3,
  Layers,
  Loader2,
  Play,
  RefreshCcw,
} from "lucide-react";
import type { BriefingLayoutSlide } from "../../lib/briefingMaterialTypes";
import { SlideRenderer } from "./SlideRenderer";

type BriefingSlideDesignerProps = {
  slides: BriefingLayoutSlide[];
  onSlidesChange: (slides: BriefingLayoutSlide[]) => void;
  isGenerating?: boolean;
  error?: string | null;
  onSave: () => void;
  onBack?: () => void;
  saving?: boolean;
  saveMessage?: string | null;
};

export function BriefingSlideDesigner({
  slides,
  onSlidesChange,
  isGenerating = false,
  error = null,
  onSave,
  onBack,
  saving = false,
  saveMessage = null,
}: BriefingSlideDesignerProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [jsonEditValue, setJsonEditValue] = useState("");

  useEffect(() => {
    if (slides[activeSlide]) {
      setJsonEditValue(JSON.stringify(slides[activeSlide], null, 2));
    }
  }, [activeSlide, slides]);

  useEffect(() => {
    if (activeSlide >= slides.length && slides.length > 0) {
      setActiveSlide(slides.length - 1);
    }
  }, [activeSlide, slides.length]);

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setJsonEditValue(newValue);
    try {
      const updatedSlide = JSON.parse(newValue) as BriefingLayoutSlide;
      const newSlides = [...slides];
      newSlides[activeSlide] = updatedSlide;
      onSlidesChange(newSlides);
    } catch {
      /* typing */
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-slate-100 font-sans text-slate-900">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-100">
            <Layers size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black leading-none tracking-tighter text-slate-800 uppercase">
              설명회 자료집 · 레이아웃
            </h1>
            <span className="text-[9px] font-black tracking-widest text-slate-400 uppercase">
              Evidence-Based Assembly · Gamma-style
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              이전
            </button>
          ) : null}
          {isGenerating ? (
            <div className="flex animate-pulse items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-[10px] font-black text-indigo-600">
              <Loader2 className="animate-spin" size={14} /> ARCHITECTING...
            </div>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || slides.length === 0}
            className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-black text-white shadow-xl transition-all hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {saving ? "저장 중…" : "저장하기"}
          </button>
        </div>
      </header>

      {saveMessage ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-2 text-center text-sm font-medium text-emerald-800">
          {saveMessage}
        </div>
      ) : null}

      <main className="flex flex-grow flex-col overflow-hidden lg:flex-row">
        <section className="flex flex-grow flex-col items-center overflow-y-auto bg-slate-50 p-6 lg:p-12">
          {slides.length === 0 && !isGenerating ? (
            <div className="flex h-full max-w-sm flex-col items-center justify-center space-y-6 text-center text-slate-400">
              <RefreshCcw size={64} className="text-slate-200" />
              <h3 className="text-xl font-black text-slate-700">분석 대기 중</h3>
              <p className="text-xs leading-relaxed font-medium">
                1단계 기획안 확정 후 「다음」을 누르면 슬라이드 레이아웃이 생성됩니다.
              </p>
            </div>
          ) : isGenerating ? (
            <div className="flex h-full flex-col items-center justify-center space-y-8">
              <div className="h-24 w-24 animate-spin rounded-full border-[10px] border-slate-200 border-t-indigo-600" />
              <p className="animate-pulse text-xl font-black tracking-tight text-slate-900">
                지능형 구조 설계 중...
              </p>
            </div>
          ) : (
            <div className="flex w-full max-w-6xl flex-col gap-12 pb-20">
              <div className="group relative aspect-video w-full">
                <SlideRenderer slide={slides[activeSlide]} />
                <div className="absolute inset-x-0 -bottom-8 flex justify-center">
                  <div className="flex min-w-[240px] items-center gap-6 rounded-2xl border border-white/10 bg-slate-900 px-6 py-3 text-white shadow-2xl">
                    <button
                      type="button"
                      disabled={activeSlide === 0}
                      onClick={() => setActiveSlide((p) => p - 1)}
                      className="rounded-xl p-2 transition-all hover:bg-indigo-600 disabled:opacity-20"
                    >
                      <ChevronRight size={20} className="rotate-180" />
                    </button>
                    <div className="flex flex-grow flex-col items-center">
                      <span className="text-[8px] font-black tracking-widest uppercase opacity-40">Progress</span>
                      <span className="text-lg font-black tracking-tighter">
                        {activeSlide + 1} / {slides.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={activeSlide === slides.length - 1}
                      onClick={() => setActiveSlide((p) => p + 1)}
                      className="rounded-xl p-2 transition-all hover:bg-indigo-600 disabled:opacity-20"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-6">
                <h4 className="flex items-center gap-2 px-2 text-[10px] font-black tracking-widest text-slate-400 uppercase">
                  <Play size={10} className="text-indigo-600" /> Presentation Flowchart
                </h4>
                <div className="briefing-scrollbar flex gap-4 overflow-x-auto px-2 pb-6">
                  {slides.map((slide, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveSlide(idx)}
                      className={`relative aspect-video min-w-[200px] overflow-hidden rounded-xl border-4 transition-all ${
                        activeSlide === idx
                          ? "z-20 scale-105 border-indigo-600 shadow-xl"
                          : "border-white shadow-sm hover:border-indigo-200"
                      }`}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 origin-top-left scale-[0.16]"
                        style={{ width: "625%", height: "625%" }}
                      >
                        <SlideRenderer slide={slide} />
                      </div>
                      <div className="absolute bottom-2 left-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[9px] font-black text-white">
                        {idx + 1}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6 rounded-3xl border bg-white p-10 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="flex items-center gap-3 text-lg font-black text-slate-800">
                      <div className="h-6 w-1.5 rounded-full bg-indigo-600" />
                      Structured Intelligence Editor
                    </h4>
                    <p className="ml-4 text-[11px] font-bold tracking-tight text-slate-400 uppercase">
                      Active Slide: {activeSlide + 1} / {slides[activeSlide]?.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-[10px] font-black text-indigo-600">
                    <Edit3 size={12} /> LIVE EDITOR
                  </div>
                </div>
                <textarea
                  value={jsonEditValue}
                  onChange={handleJsonChange}
                  className="briefing-scrollbar h-80 w-full resize-none rounded-2xl border-none bg-slate-950 p-8 font-mono text-xs leading-relaxed text-indigo-300 shadow-inner outline-none focus:ring-4 focus:ring-indigo-500/20"
                  spellCheck={false}
                />
              </div>
            </div>
          )}
          {error ? (
            <div className="mt-4 flex max-w-lg items-start gap-3 rounded-2xl border-2 border-rose-100 bg-rose-50 p-5 text-xs font-bold leading-relaxed text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
