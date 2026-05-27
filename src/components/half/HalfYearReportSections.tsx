import { PolygonRadarChart, type RadarDatum } from "../monthly/MonthlyReportResultView";
import {
  PILLAR_KEYS,
  pillarLabelsKo,
  type PillarKey,
} from "../../lib/reportAggregates";
import type { HalfYearReadingTypeDef } from "../../lib/halfYearReadingTypes";
import { HalfYearGauge } from "./HalfYearGauge";

export type HalfYearReportViewModel = {
  halfLabel: string;
  scoreOverview: string;
  pillarDescs: Record<PillarKey, string>;
  gaugeHighLabel: string;
  gaugeLowLabel: string;
  gaugeHighDesc: string;
  gaugeLowDesc: string;
  readingType: HalfYearReadingTypeDef | null;
  teacherComment: string;
  radarAverages: Record<PillarKey, number>;
};

function splitParagraphs(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const byBlank = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return t.split("\n").map((p) => p.trim()).filter(Boolean);
}

function sectionHeader(title: string) {
  return (
    <div className="rounded-t-lg bg-[#1a3b6b] px-4 py-2.5">
      <h3 className="text-sm font-bold tracking-wide text-white">{title}</h3>
    </div>
  );
}

export function HalfYearReportSections({ model }: { model: HalfYearReportViewModel }) {
  const radarData: RadarDatum[] = PILLAR_KEYS.map((k) => ({
    subject: pillarLabelsKo[k],
    score: Math.min(100, Math.max(0, (model.radarAverages[k] ?? 0) * 10)),
  }));

  return (
    <div className="space-y-6 overflow-hidden rounded-xl border border-slate-200 bg-[#eef4fb] shadow-sm">
      <header className="bg-gradient-to-r from-[#1a3b6b] to-[#2a5b9c] px-5 py-4 text-center">
        <p className="text-xs font-medium text-blue-100">한우리독서토론논술</p>
        <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">6개월 성장 리포트</h2>
        <p className="mt-1 text-xs text-blue-100">{model.halfLabel}</p>
      </header>

      <div className="space-y-4 px-4 pb-4">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {sectionHeader("1. 최근 6개월간의 점수 평균")}
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col items-center justify-center">
              <PolygonRadarChart data={radarData} />
              <ul className="mt-3 w-full space-y-1 text-xs text-slate-600">
                {PILLAR_KEYS.map((k) => (
                  <li key={k} className="flex gap-2">
                    <span className="shrink-0 font-medium text-slate-800">{pillarLabelsKo[k]}</span>
                    <span>{model.pillarDescs[k]?.trim() || "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-slate-800">
              {splitParagraphs(model.scoreOverview).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
          <div className="grid gap-4 border-t border-slate-100 bg-slate-50/80 px-4 py-4 sm:grid-cols-2">
            <HalfYearGauge
              variant="high"
              label="집중 성취 포인트"
              description={`${model.gaugeHighLabel} — ${model.gaugeHighDesc}`}
            />
            <HalfYearGauge
              variant="low"
              label="향후 강화 포인트"
              description={`${model.gaugeLowLabel} — ${model.gaugeLowDesc}`}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {sectionHeader("2. 우리 아이 독서 유형")}
          <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-center">
            <div className="flex justify-center">
              <div className="rounded-3xl bg-gradient-to-br from-sky-100 to-indigo-100 px-6 py-8 text-center shadow-inner ring-2 ring-sky-200/80">
                <p className="text-lg font-bold leading-snug text-[#1a3b6b]">
                  {model.readingType?.typeName ?? "—"}
                </p>
              </div>
            </div>
            <div className="space-y-2 text-sm leading-relaxed text-slate-800">
              {model.readingType ? (
                splitParagraphs(model.readingType.description).map((p, i) => <p key={i}>{p}</p>)
              ) : (
                <p className="text-slate-500">6개월 평균 역량을 바탕으로 유형을 판별합니다.</p>
              )}
              {model.readingType ? (
                <p className="text-xs text-slate-500">{model.readingType.comboLabel}</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {sectionHeader("3. 선생님의 따뜻한 한마디")}
          <div className="space-y-3 p-4 text-sm leading-relaxed text-slate-800">
            {splitParagraphs(model.teacherComment).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
