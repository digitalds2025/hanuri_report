import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import type { OfficialDataFact, OfficialDataScanResult } from "../../lib/briefingMaterialTypes";

const GRADE_LABEL: Record<string, string> = {
  A: "A — 공공·공식 기관",
  B: "B — 학교 공개 자료",
  C: "C — 브랜드 메시지",
  D: "D — 참고만",
};

const CATEGORY_LABEL: Record<string, string> = {
  district_structure: "① 학군·학교 구조",
  local_infra: "④ 지자체 교육 인프라",
  curriculum_evaluation: "② 교육과정·평가",
  admission_stats: "③ 진학·입시",
  지자체: "지자체",
  학군: "학군",
  평가: "평가",
  진학: "진학",
  정책: "정책",
};

type Props = {
  fact: OfficialDataFact;
  scan: OfficialDataScanResult;
  onClose: () => void;
};

function categoryLabel(cat: string): string {
  return CATEGORY_LABEL[cat] ?? cat;
}

export function OfficialFactDetailModal({ fact, scan, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const relatedLinks = scan.sourceLinks.filter((s) => {
    if (!fact.sourceUri) return false;
    try {
      const a = new URL(fact.sourceUri);
      const b = new URL(s.uri);
      return a.hostname === b.hostname || s.title === fact.sourceTitle;
    } catch {
      return s.title === fact.sourceTitle;
    }
  });

  const linksToShow = relatedLinks.length > 0 ? relatedLinks : scan.sourceLinks.slice(0, 5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fact-detail-title"
      onClick={onClose}
    >
      <div
        className="briefing-scrollbar flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">
              {GRADE_LABEL[fact.grade] ?? fact.grade} · {categoryLabel(fact.category)}
            </p>
            <h2 id="fact-detail-title" className="mt-1 text-lg font-bold text-slate-900">
              수집 사실 상세
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs leading-relaxed text-indigo-950">
            <p className="font-bold">자료 제작 시 AI가 쓰는 범위</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>사용함:</strong> 아래 「수집 사실」 문장 + 전체 스캔 digest 요약(최대 약 1만2천자)
              </li>
              <li>
                <strong>저장·전달 안 함:</strong> 출처 웹페이지 원문 전체(표·첨부 PDF 등). 확인은 링크에서
                직접 해 주세요.
              </li>
            </ul>
          </div>

          <section>
            <h3 className="text-xs font-bold text-slate-500">수집 사실 (1차 근거 문장)</h3>
            <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
              {fact.fact}
            </p>
          </section>

          {fact.sourceExcerpt ? (
            <section>
              <h3 className="text-xs font-bold text-slate-500">출처 발췌 (검색·스캔 시 확보)</h3>
              <p className="mt-2 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                {fact.sourceExcerpt}
              </p>
            </section>
          ) : (
            <p className="text-xs text-slate-500">
              이번 스캔에는 출처 원문 발췌가 저장되지 않았습니다. 출처 링크에서 전체 내용을 확인할 수
              있습니다.
            </p>
          )}

          {(fact.sourceTitle || fact.sourceUri) && (
            <section>
              <h3 className="text-xs font-bold text-slate-500">출처</h3>
              <p className="mt-1 text-sm font-medium text-slate-800">{fact.sourceTitle ?? "—"}</p>
              {fact.sourceUri ? (
                <a
                  href={fact.sourceUri}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline"
                >
                  원문 페이지 열기 <ExternalLink size={14} />
                </a>
              ) : null}
            </section>
          )}

          {linksToShow.length > 0 ? (
            <section>
              <h3 className="text-xs font-bold text-slate-500">스캔 시 참조된 관련 링크</h3>
              <ul className="mt-2 space-y-2 text-xs">
                {linksToShow.map((s) => (
                  <li key={s.uri}>
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-700 hover:underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <details className="rounded-lg border border-slate-100 bg-slate-50 text-xs text-slate-600">
            <summary className="cursor-pointer px-3 py-2 font-semibold text-slate-700">
              스캔 digest 일부 (자료 제작에 함께 전달)
            </summary>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-3 pb-3 font-sans leading-relaxed">
              {scan.digestText.slice(0, 2500)}
              {scan.digestText.length > 2500 ? "\n\n…" : ""}
            </pre>
          </details>
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-800 py-2.5 text-sm font-bold text-white hover:bg-slate-900"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
