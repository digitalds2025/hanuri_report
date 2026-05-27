import { useMemo, useState } from "react";
import { CheckCircle2, Circle, FileText, Loader2, RefreshCw } from "lucide-react";
import type { BriefingFoundationReport, BriefingTopicCandidate } from "../../lib/briefingMaterialTypes";
import type { LocalEduDataLayerResult } from "../../lib/localEdu/types";
import { CORE_TOPIC_OPTIONS } from "../../lib/localEdu/types";
import type { LocalEduInput } from "../../lib/localEdu/types";
import { purposeLabel } from "../../lib/geminiBriefingKit";
import type { LocalEduTokenLedger } from "../../lib/localEdu/tokenUsage";
import { TokenUsagePanel } from "./TokenUsagePanel";

type ManuscriptReviewPageProps = {
  input: LocalEduInput;
  data: LocalEduDataLayerResult;
  topic: BriefingTopicCandidate;
  report: BriefingFoundationReport;
  onReportChange: (report: BriefingFoundationReport) => void;
  attachmentNames: string[];
  tokenLedger: LocalEduTokenLedger;
  busy: boolean;
  status: string | null;
  error: string | null;
  onRegenerate: () => void;
  onContinue: () => void;
  onBack: () => void;
};

type CheckId =
  | "region"
  | "target"
  | "purpose"
  | "topic"
  | "facts"
  | "prose";

const CHECK_ITEMS: { id: CheckId; label: string }[] = [
  { id: "region", label: "지역·필수 조건(시·군·구)이 본문에 반영되었나요?" },
  { id: "target", label: "설명 대상(학교급·학년)에 맞는 내용인가요?" },
  { id: "purpose", label: "설명회 목적(모집/재원·직접입력)에 맞게 서술되었나요?" },
  { id: "topic", label: "선택한 자료집 주제를 중심으로 일관되게 썼나요?" },
  { id: "facts", label: "수집 fact·공식 출처(학교알리미·교육청 등)가 인용되었나요?" },
  { id: "prose", label: "줄글로 읽을 수 있고, 중간에 끊긴 문장이 없나요?" },
];

export function ManuscriptReviewPage({
  input,
  data,
  topic,
  report,
  onReportChange,
  attachmentNames,
  tokenLedger,
  busy,
  status,
  error,
  onRegenerate,
  onContinue,
  onBack,
}: ManuscriptReviewPageProps) {
  const [checks, setChecks] = useState<Record<CheckId, boolean>>({
    region: false,
    target: false,
    purpose: false,
    topic: false,
    facts: false,
    prose: false,
  });

  const purposeText =
    input.purposeCustom?.trim() ||
    purposeLabel(input.parentAudience);
  const coreLabels = input.coreTopics
    .map((id) => CORE_TOPIC_OPTIONS.find((o) => o.id === id)?.label)
    .filter(Boolean);

  const charCount = report.markdown.length;
  const sectionCount = report.sections.length;
  const factCount = data.scan.facts.length;
  const allChecked = useMemo(() => CHECK_ITEMS.every((c) => checks[c.id]), [checks]);

  function toggleCheck(id: CheckId) {
    setChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function updateMarkdown(md: string) {
    onReportChange({
      ...report,
      markdown: md,
      sections: md.split(/^##\s+/m).filter(Boolean).map((chunk, i) => {
        const lines = chunk.trim().split("\n");
        return {
          id: `sec-${i + 1}`,
          heading: lines[0]?.trim() ?? `섹션 ${i + 1}`,
          body: lines.slice(1).join("\n").trim(),
        };
      }),
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-28">
      <div>
        <div className="flex items-center gap-2 text-indigo-600">
          <FileText size={20} />
          <span className="text-xs font-bold uppercase tracking-wide">설명자료 줄글 검토</span>
        </div>
        <h1 className="mt-1 text-2xl font-black text-slate-900">종합 레포트 확인</h1>
        <p className="mt-2 text-sm text-slate-600">
          주제 선택 다음 단계입니다. AI가 작성한 <strong>설명자료 원고</strong>가 입력 조건·수집
          데이터·선택 주제에 맞는지 확인·수정한 뒤, 승인하면 슬라이드 {input.pageCount}장 기획으로
          넘어갑니다.
        </p>
      </div>

      <TokenUsagePanel ledger={tokenLedger} highlight="manuscript" />

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">입력 조건 (기획 기준)</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">지역</dt>
            <dd className="font-medium">
              {input.region} {input.subRegion}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">설명 대상</dt>
            <dd className="font-medium">
              {input.schoolLevel} · {input.targetGrade}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">목적</dt>
            <dd className="font-medium">{purposeText}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">핵심 주제</dt>
            <dd className="font-medium">{coreLabels.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">수집 fact</dt>
            <dd className="font-medium">{factCount}건 · 학교 {data.scan.discoveredSchools.length}곳</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">슬라이드 목표</dt>
            <dd className="font-medium">{input.pageCount}장</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5">
        <h2 className="text-sm font-bold text-indigo-900">선택한 자료집 주제</h2>
        <p className="mt-2 font-bold text-slate-900">{topic.title}</p>
        <p className="mt-1 text-sm text-slate-700">{topic.summary}</p>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">기획 적합성 체크리스트</h2>
        <p className="mt-1 text-xs text-slate-500">
          항목을 확인한 뒤 체크하세요. 모두 체크해야 슬라이드 기획으로 진행할 수 있습니다.
        </p>
        <ul className="mt-4 space-y-2">
          {CHECK_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggleCheck(item.id)}
                className="flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-slate-50"
              >
                {checks[item.id] ? (
                  <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                ) : (
                  <Circle className="mt-0.5 shrink-0 text-slate-300" size={18} />
                )}
                <span className="text-sm text-slate-800">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800">설명자료 원고 (줄글)</h2>
          <p className="text-xs text-slate-500">
            {charCount.toLocaleString("ko-KR")}자 · 섹션 {sectionCount}개
            {attachmentNames.length ? ` · 첨부 ${attachmentNames.join(", ")}` : ""}
          </p>
        </div>
        <textarea
          className="mt-3 min-h-[420px] w-full rounded-lg border px-4 py-3 font-mono text-sm leading-relaxed"
          value={report.markdown}
          onChange={(e) => updateMarkdown(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          disabled={busy}
          onClick={onRegenerate}
          className="mt-3 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
          원고 다시 생성
        </button>
      </section>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {status ? <p className="text-sm text-indigo-600">{status}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="rounded-lg border px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          ← 주제 선택
        </button>
        <button
          type="button"
          disabled={busy || !allChecked || charCount < 500}
          onClick={onContinue}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              처리 중…
            </>
          ) : (
            <>슬라이드 {input.pageCount}장 기획으로 →</>
          )}
        </button>
      </div>
      {!allChecked ? (
        <p className="text-center text-xs text-amber-700">체크리스트 6항목을 모두 확인해 주세요.</p>
      ) : null}
    </div>
  );
}
