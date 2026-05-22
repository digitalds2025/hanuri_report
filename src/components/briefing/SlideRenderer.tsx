import {
  BarChart3,
  BookOpen,
  CheckSquare,
  GraduationCap,
  Grid,
  Image as ImageIcon,
  Lightbulb,
  Quote,
  Shield,
  Star,
  Table as TableIcon,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { BriefingLayoutSlide } from "../../lib/briefingMaterialTypes";

type SlideRendererProps = {
  slide: BriefingLayoutSlide | null | undefined;
  /**
   * 960×540 PPT 캔버스 (16:9). SlideScaledPreview가 transform scale로 축소합니다.
   * @deprecated stage 사용
   */
  preview?: boolean;
  /** 실제 슬라이드 비율·해상도 기준 렌더 (미리보기용) */
  stage?: boolean;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

const ICON_MAP: Record<string, typeof BookOpen> = {
  book: BookOpen,
  users: Users,
  chart: BarChart3,
  school: GraduationCap,
  target: Target,
  lightbulb: Lightbulb,
  shield: Shield,
  star: Star,
  trending: TrendingUp,
};

function LucideByName(name: string, size = 28) {
  const Icon = ICON_MAP[name.toLowerCase()] ?? Lightbulb;
  return <Icon size={size} className="text-indigo-600 shrink-0" />;
}

const slideFrameCompact =
  "w-full aspect-video max-h-[min(72vh,540px)] p-8 sm:p-10 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 bg-white relative";

/** 16:9 PPT 스테이지 (960×540) — 외부 scale 적용 전 원본 크기 */
const slideFrameStage =
  "w-[960px] h-[540px] shrink-0 p-10 rounded-none flex flex-col overflow-hidden border-0 bg-white relative box-border";

function isStageMode(preview?: boolean, stage?: boolean): boolean {
  return stage ?? preview ?? false;
}

function clamp(stage: boolean, limited: string): string {
  return stage ? "" : limited;
}

export function SlideRenderer({ slide, preview = false, stage: stageProp }: SlideRendererProps) {
  if (!slide) return null;
  const stage = isStageMode(preview, stageProp);
  const baseClasses = stage ? slideFrameStage : slideFrameCompact;
  const iconMd = stage ? 32 : 28;

  switch (slide.type) {
    case "TITLE":
      return (
        <div className={[baseClasses, "items-center justify-center text-center bg-slate-900 text-white"].join(" ")}>
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
          <h1 className={`${stage ? "text-5xl" : "text-4xl sm:text-5xl"} font-black mb-6 leading-tight ${clamp(stage, "line-clamp-3")}`}>{str(slide.title)}</h1>
          <p className={`${stage ? "text-xl" : "text-lg sm:text-xl"} text-slate-400 font-medium max-w-3xl ${clamp(stage, "line-clamp-2")}`}>{str(slide.subtitle)}</p>
        </div>
      );
    case "SECTION_HEADER": {
      const dark = slide.tone === "dark" || slide.storyPhase === "intro";
      return (
        <div
          className={[
            baseClasses,
            "justify-center text-center",
            dark ? "bg-slate-900 text-white" : "bg-indigo-700 text-white",
          ].join(" ")}
        >
          <h2 className={`${stage ? "text-5xl" : "text-4xl sm:text-5xl"} font-black mb-4 ${clamp(stage, "line-clamp-2")}`}>{str(slide.title)}</h2>
          <p
            className={[
              `${stage ? "text-xl" : "text-lg"} max-w-2xl mx-auto ${clamp(stage, "line-clamp-3")}`,
              dark ? "text-slate-400" : "text-indigo-100/80",
            ].join(" ")}
          >
            {str(slide.description)}
          </p>
        </div>
      );
    }
    case "STAT_GRID": {
      const stats = Array.isArray(slide.stats)
        ? (slide.stats as { value?: string; label?: string; subtext?: string; icon?: string }[])
        : [];
      return (
        <div className={baseClasses}>
          <h2 className={`${stage ? "text-3xl" : "text-2xl"} font-bold mb-6 text-slate-900 ${clamp(stage, "line-clamp-1")}`}>{str(slide.title)}</h2>
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
            {stats.slice(0, 4).map((s, i) => (
              <div
                key={i}
                className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-4"
              >
                <div className="mb-2">{LucideByName(str(s.icon) || "chart", iconMd)}</div>
                <div className={`${stage ? "text-4xl" : "text-3xl"} font-black text-indigo-700 ${clamp(stage, "line-clamp-1")}`}>{str(s.value)}</div>
                <div className={`${stage ? "text-base" : "text-sm"} font-bold text-slate-800 mt-1 ${clamp(stage, "line-clamp-2")}`}>{str(s.label)}</div>
                {s.subtext ? (
                  <div className="text-[10px] text-slate-500 mt-1 line-clamp-1">{str(s.subtext)}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "CHART_BAR": {
      const bars = Array.isArray(slide.bars)
        ? (slide.bars as { label?: string; value?: number; display?: string }[])
        : [];
      const max = Math.max(...bars.map((b) => Number(b.value) || 0), 1);
      return (
        <div className={baseClasses}>
          <h2 className={`${stage ? "text-3xl" : "text-2xl"} font-bold mb-6 text-slate-900 ${clamp(stage, "line-clamp-1")}`}>{str(slide.title)}</h2>
          <div className="flex flex-col justify-center gap-4 flex-1 min-h-0">
            {bars.slice(0, 4).map((b, i) => {
              const pct = Math.min(100, Math.round(((Number(b.value) || 0) / max) * 100));
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-sm font-bold text-slate-700">
                    <span className="line-clamp-1 flex-1 pr-2">{str(b.label)}</span>
                    <span className="text-indigo-600 shrink-0">{str(b.display) || `${pct}%`}</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    case "ICON_GRID": {
      const icons = Array.isArray(slide.icons)
        ? (slide.icons as { icon?: string; label?: string; desc?: string }[])
        : [];
      return (
        <div className={baseClasses}>
          <h2 className="text-2xl font-bold mb-5 text-slate-900 line-clamp-1">{str(slide.title)}</h2>
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
            {icons.slice(0, 4).map((ic, i) => (
              <div
                key={i}
                className="flex gap-3 items-start rounded-xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="shrink-0 rounded-lg bg-white p-2 shadow-sm">
                  {LucideByName(str(ic.icon), iconMd)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-sm line-clamp-2">{str(ic.label)}</p>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{str(ic.desc)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "KPI_ROW": {
      const kpis = Array.isArray(slide.kpis)
        ? (slide.kpis as { value?: string; label?: string }[])
        : [];
      return (
        <div className={baseClasses}>
          <h2 className="text-2xl font-bold mb-6 text-slate-900 text-center line-clamp-1">{str(slide.title)}</h2>
          <div className="grid grid-cols-3 gap-4 flex-1 items-center min-h-0">
            {kpis.slice(0, 3).map((k, i) => (
              <div
                key={i}
                className="text-center rounded-2xl bg-indigo-600 text-white py-6 px-3 shadow-lg"
              >
                <div className="text-3xl font-black line-clamp-1">{str(k.value)}</div>
                <div className="text-xs font-semibold mt-2 opacity-90 line-clamp-2">{str(k.label)}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "PROCESS_FLOW": {
      const steps = Array.isArray(slide.steps)
        ? (slide.steps as { title?: string; content?: string }[])
        : [];
      return (
        <div className={baseClasses}>
          <h2 className={`${stage ? "text-3xl" : "text-2xl"} font-bold mb-6 text-slate-900 ${clamp(stage, "line-clamp-1")}`}>{str(slide.title)}</h2>
          <div className="grid grid-cols-4 gap-2 flex-1 items-stretch min-h-0">
            {steps.slice(0, 4).map((step, i) => (
              <div key={i} className="flex flex-col rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-3">
                <span className="text-lg font-black text-indigo-600">{i + 1}</span>
                <p className="text-xs font-bold text-slate-800 mt-2 line-clamp-3">{step.title ?? ""}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "GRID_CARDS": {
      const cards = Array.isArray(slide.cards)
        ? (slide.cards as { title?: string; desc?: string }[])
        : [];
      return (
        <div className={baseClasses}>
          <h2 className="text-3xl font-bold mb-10 text-slate-900 flex items-center gap-3">
            <Grid className="text-indigo-600" /> {str(slide.title)}
          </h2>
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
            {cards.map((card, i) => (
              <div key={i} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h4 className="font-black text-slate-800 mb-2">{card.title ?? ""}</h4>
                <p className="text-sm text-slate-500 leading-relaxed">{card.desc ?? ""}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "DATA_TABLE": {
      const headers = strArr(slide.headers);
      const rows = Array.isArray(slide.rows) ? (slide.rows as string[][]) : [];
      return (
        <div className={baseClasses}>
          <h2 className="text-3xl font-bold mb-8 text-slate-900 flex items-center gap-3">
            <TableIcon className="text-indigo-600" /> {str(slide.title)}
          </h2>
          <div className="flex-grow overflow-hidden border rounded-xl">
            <table className="w-full h-full border-collapse">
              <thead className="bg-slate-900 text-white text-sm">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="px-6 py-4 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y text-sm">
                {rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-6 py-4 text-slate-700">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    case "COMPARISON":
      return (
        <div className={[baseClasses, "bg-slate-50"].join(" ")}>
          <h2 className="text-3xl font-bold mb-10 text-center">{str(slide.title)}</h2>
          <div className="grid grid-cols-2 gap-8 flex-grow">
            <div className="bg-white p-8 rounded-3xl shadow-sm border-l-8 border-blue-500">
              <h3 className="text-2xl font-black text-blue-600 mb-6">{str(slide.leftTitle)}</h3>
              <ul className="space-y-4">
                {strArr(slide.leftItems).map((item, i) => (
                  <li key={i} className="text-lg text-slate-600">
                    ✓ {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white p-8 rounded-3xl shadow-sm border-l-8 border-indigo-500">
              <h3 className="text-2xl font-black text-indigo-600 mb-6">{str(slide.rightTitle)}</h3>
              <ul className="space-y-4">
                {strArr(slide.rightItems).map((item, i) => (
                  <li key={i} className="text-lg text-slate-600">
                    ✓ {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      );
    case "CHECKLIST":
      return (
        <div className={[baseClasses, "bg-emerald-50"].join(" ")}>
          <h2 className="text-3xl font-bold mb-10 text-emerald-900 flex items-center gap-3">
            <CheckSquare className="text-emerald-600" /> {str(slide.title)}
          </h2>
          <div className="grid gap-2 flex-1 min-h-0 content-start">
            {strArr(slide.items).slice(0, 5).map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-white p-3 rounded-xl border border-emerald-100 shadow-sm"
              >
                <div className="w-6 h-6 rounded-full border-2 border-emerald-300 flex-shrink-0" />
                <span className="text-sm font-bold text-slate-700 line-clamp-2">{item}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "STEP_CARDS": {
      const steps = Array.isArray(slide.steps)
        ? (slide.steps as { title?: string; content?: string }[])
        : [];
      return (
        <div className={baseClasses}>
          <h2 className="text-3xl font-bold mb-12 text-slate-900">{str(slide.title)}</h2>
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            {steps.map((step, i) => (
              <div key={i} className="flex items-stretch gap-6 group">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-lg flex-shrink-0">
                  0{i + 1}
                </div>
                <div className="flex-grow bg-slate-50 p-6 rounded-2xl border border-slate-100 group-hover:bg-white transition-all">
                  <h4 className="text-xl font-black text-indigo-900 mb-2">{step.title ?? ""}</h4>
                  <p className="text-slate-600 leading-relaxed">{step.content ?? ""}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "METRIC":
      return (
        <div className={[baseClasses, "bg-slate-900 text-white items-center justify-center text-center p-24"].join(" ")}>
          <h2 className="text-3xl font-bold mb-12 text-indigo-400">{str(slide.title)}</h2>
          <div className="text-[140px] font-black leading-none mb-4">
            {str(slide.value)}
          </div>
          <div className="text-3xl font-bold text-indigo-300 mb-6">{str(slide.label)}</div>
          <p className="text-xl text-slate-400 max-w-2xl leading-relaxed">{str(slide.description)}</p>
        </div>
      );
    case "DETAILED_TEXT":
      return (
        <div className={baseClasses}>
          <h2 className="text-3xl font-bold mb-10 text-indigo-950 border-b pb-6">{str(slide.title)}</h2>
          <div className="grid gap-3 flex-1 min-h-0">
            {strArr(slide.paragraphs).slice(0, 4).map((p, i) => (
              <p key={i} className="text-base leading-snug text-slate-600 font-medium line-clamp-3">
                {p}
              </p>
            ))}
          </div>
        </div>
      );
    case "IMAGE_AND_TEXT":
      return (
        <div className={baseClasses}>
          <h2 className="text-3xl font-bold mb-10 text-indigo-900 border-b pb-4">{str(slide.title)}</h2>
          <div className="grid grid-cols-2 gap-10 flex-grow items-center">
            <div className="bg-slate-100 rounded-2xl aspect-square flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200">
              <ImageIcon size={64} className="text-slate-300 mb-4" />
              <p className="text-[10px] text-slate-400 text-center font-mono uppercase tracking-tighter">
                {str(slide.imageDescription)}
              </p>
            </div>
            <p className="text-2xl leading-relaxed text-slate-700 font-medium">{str(slide.content)}</p>
          </div>
        </div>
      );
    case "QUOTE":
      return (
        <div className={[baseClasses, "bg-indigo-50 items-center justify-center text-center p-20"].join(" ")}>
          <Quote size={60} className="text-indigo-200 mb-6" />
          <blockquote className="text-3xl font-serif italic text-slate-800 mb-8 leading-snug">
            &ldquo;{str(slide.text)}&rdquo;
          </blockquote>
          <cite className="text-xl font-bold text-indigo-600 not-italic">— {str(slide.author)}</cite>
        </div>
      );
    case "INSTRUCTOR_INSIGHT": {
      const prompts = strArr(slide.prompts);
      return (
        <div className={[baseClasses, "bg-amber-50 border-amber-200"].join(" ")}>
          <div className="mb-6 inline-flex rounded-full bg-amber-400 px-4 py-1 text-xs font-black uppercase tracking-wider text-amber-950">
            강사 인사이트 보강
          </div>
          <h2 className="text-3xl font-bold mb-8 text-amber-950">{str(slide.title)}</h2>
          <ul className="grid gap-2 flex-1 min-h-0">
            {prompts.slice(0, 4).map((p, i) => (
              <li
                key={i}
                className="rounded-xl border-2 border-dashed border-amber-300 bg-white/80 p-3 text-sm font-medium text-amber-900 line-clamp-3"
              >
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-amber-700/80">
            현장 노하우를 채워 넣으면 설명회 자료의 마지막 2% 차별화가 완성됩니다.
          </p>
        </div>
      );
    }
    case "SOURCES": {
      const items = strArr(slide.items);
      return (
        <div className={[baseClasses, "bg-slate-50"].join(" ")}>
          <h2 className="text-2xl font-bold mb-4 text-slate-800">{str(slide.title) || "참고 및 기준 시점"}</h2>
          <p className="mb-8 text-lg font-semibold text-indigo-700">
            지역 자료 기준 시점: {str(slide.dataAsOf) || "—"}
          </p>
          <ul className="grid gap-2 text-xs text-slate-600 flex-1 min-h-0">
            {items.slice(0, 8).map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-indigo-400">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    default: {
      const items = strArr(slide.items).length
        ? strArr(slide.items)
        : strArr(slide.bullets);
      if (items.length) {
        return (
          <div className={baseClasses}>
            <h2 className="text-2xl font-bold mb-4 text-slate-900 line-clamp-1">{str(slide.title)}</h2>
            <ul className="grid gap-2 flex-1">
              {items.slice(0, 5).map((item, i) => (
                <li key={i} className="text-sm font-medium text-slate-700 line-clamp-2">
                  • {item}
                </li>
              ))}
            </ul>
          </div>
        );
      }
      return (
        <div className={[baseClasses, "items-center justify-center"].join(" ")}>
          <h2 className="text-2xl font-bold text-slate-800">{str(slide.title) || "슬라이드"}</h2>
          <p className="text-sm text-slate-500 mt-2">({str(slide.type) || "레이아웃"})</p>
        </div>
      );
    }
  }
}
