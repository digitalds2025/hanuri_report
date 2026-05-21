import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { OfficialDataFact, OfficialDataScanResult } from "../../lib/briefingMaterialTypes";
import { OfficialFactDetailModal } from "./OfficialFactDetailModal";

type Props = {
  scan: OfficialDataScanResult;
  compact?: boolean;
};

export function OfficialScanResultsPanel({ scan, compact = false }: Props) {
  const facts = scan.facts;
  const maxFacts = compact ? 12 : 40;
  const [selectedFact, setSelectedFact] = useState<OfficialDataFact | null>(null);

  return (
    <>
      <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
        <div>
          <h2 className="text-sm font-bold text-emerald-900">수집된 공식 데이터</h2>
          <p className="mt-1 text-xs text-emerald-800">
            {scan.regionName} · {scan.scannedAt.slice(0, 16).replace("T", " ")} · facts {facts.length}
            건 · 출처 {scan.sourceLinks.length}건
          </p>
          <p className="mt-2 rounded-lg border border-emerald-200/80 bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
            주제·아웃라인·슬라이드 작성 시 AI는 <strong>각 사실의 한 줄 요약</strong>과{" "}
            <strong>스캔 digest</strong>만 근거로 씁니다. 목록을 누르면 발췌·출처·원문 링크를 볼 수
            있습니다. (웹페이지 전체 원문은 저장하지 않음)
          </p>
        </div>

        {scan.discoveredSchools.length > 0 ? (
          <div>
            <h3 className="text-xs font-bold text-slate-700">관내 학교 ({scan.discoveredSchools.length})</h3>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {scan.discoveredSchools.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-700 shadow-sm"
                >
                  {s}
                </span>
              ))}
            </p>
          </div>
        ) : null}

        <div>
          <h3 className="text-xs font-bold text-slate-700">수집 사실 목록 — 클릭하여 상세</h3>
          <ul className="briefing-scrollbar mt-2 max-h-64 space-y-2 overflow-y-auto text-sm text-slate-700">
            {facts.slice(0, maxFacts).map((f, i) => (
              <li key={`${f.fact}-${i}`}>
                <button
                  type="button"
                  onClick={() => setSelectedFact(f)}
                  className="group w-full rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="mr-1.5 text-[10px] font-bold text-indigo-600">[{f.grade}]</span>
                      <span className="text-[10px] text-slate-400">{f.category}</span>
                      <p className="mt-0.5 leading-relaxed">{f.fact}</p>
                      {f.sourceTitle ? (
                        <p className="mt-1 truncate text-[10px] text-slate-400">{f.sourceTitle}</p>
                      ) : null}
                    </div>
                    <ChevronRight
                      size={16}
                      className="mt-1 shrink-0 text-slate-300 group-hover:text-indigo-500"
                    />
                  </div>
                </button>
              </li>
            ))}
            {facts.length > maxFacts ? (
              <li className="text-center text-xs text-slate-400">외 {facts.length - maxFacts}건…</li>
            ) : null}
          </ul>
        </div>

        {!compact && scan.sourceLinks.length > 0 ? (
          <div>
            <h3 className="text-xs font-bold text-slate-700">출처 링크 (전체)</h3>
            <ul className="briefing-scrollbar mt-2 max-h-36 space-y-1 overflow-y-auto text-[11px]">
              {scan.sourceLinks.map((s) => (
                <li key={s.uri}>
                  <a href={s.uri} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {selectedFact ? (
        <OfficialFactDetailModal
          fact={selectedFact}
          scan={scan}
          onClose={() => setSelectedFact(null)}
        />
      ) : null}
    </>
  );
}
