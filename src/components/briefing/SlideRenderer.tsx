import {
  CheckSquare,
  Grid,
  Image as ImageIcon,
  Quote,
  Table as TableIcon,
} from "lucide-react";
import type { BriefingLayoutSlide } from "../../lib/briefingMaterialTypes";

type SlideRendererProps = {
  slide: BriefingLayoutSlide | null | undefined;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function SlideRenderer({ slide }: SlideRendererProps) {
  if (!slide) return null;
  const baseClasses =
    "w-full h-full p-12 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 bg-white relative";

  switch (slide.type) {
    case "TITLE":
      return (
        <div className={[baseClasses, "items-center justify-center text-center bg-slate-900 text-white"].join(" ")}>
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
          <h1 className="text-6xl font-black mb-10 leading-tight">{str(slide.title)}</h1>
          <p className="text-2xl text-slate-400 font-medium max-w-4xl">{str(slide.subtitle)}</p>
        </div>
      );
    case "SECTION_HEADER":
      return (
        <div className={[baseClasses, "justify-center bg-indigo-700 text-white text-center"].join(" ")}>
          <h2 className="text-7xl font-black mb-6">{str(slide.title)}</h2>
          <p className="text-xl text-indigo-100/70">{str(slide.description)}</p>
        </div>
      );
    case "GRID_CARDS": {
      const cards = Array.isArray(slide.cards)
        ? (slide.cards as { title?: string; desc?: string }[])
        : [];
      return (
        <div className={baseClasses}>
          <h2 className="text-3xl font-bold mb-10 text-slate-900 flex items-center gap-3">
            <Grid className="text-indigo-600" /> {str(slide.title)}
          </h2>
          <div className="grid grid-cols-2 gap-6 flex-grow overflow-y-auto pr-2 briefing-scrollbar">
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
          <div className="space-y-4 flex-grow overflow-y-auto">
            {strArr(slide.items).map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-6 bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm"
              >
                <div className="w-8 h-8 rounded-full border-4 border-emerald-200 flex-shrink-0" />
                <span className="text-xl font-bold text-slate-700">{item}</span>
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
          <div className="flex flex-col gap-6 flex-grow overflow-y-auto pr-2 briefing-scrollbar">
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
          <div className="text-[140px] font-black leading-none mb-4">{str(slide.value)}</div>
          <div className="text-3xl font-bold text-indigo-300 mb-6">{str(slide.label)}</div>
          <p className="text-xl text-slate-400 max-w-2xl leading-relaxed">{str(slide.description)}</p>
        </div>
      );
    case "DETAILED_TEXT":
      return (
        <div className={baseClasses}>
          <h2 className="text-3xl font-bold mb-10 text-indigo-950 border-b pb-6">{str(slide.title)}</h2>
          <div className="flex-grow overflow-y-auto space-y-8 pr-4 briefing-scrollbar">
            {strArr(slide.paragraphs).map((p, i) => (
              <p key={i} className="text-xl leading-relaxed text-slate-600 text-justify font-medium">
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
          <ul className="space-y-4 flex-grow overflow-y-auto briefing-scrollbar">
            {prompts.map((p, i) => (
              <li
                key={i}
                className="rounded-2xl border-2 border-dashed border-amber-300 bg-white/80 p-6 text-lg font-medium text-amber-900"
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
          <ul className="space-y-3 text-sm text-slate-600 flex-grow overflow-y-auto briefing-scrollbar">
            {items.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-indigo-400">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    default:
      return <div className="p-10 bg-red-50 text-red-600">지원하지 않는 레이아웃</div>;
  }
}
