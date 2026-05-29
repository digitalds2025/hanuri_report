import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ReportFinalStepActions } from "../reports/ReportFinalStepActions";
import { ReportSaveRedirectDialog } from "../reports/ReportSaveRedirectDialog";
import { useReportFileExport } from "../../hooks/useReportFileExport";
import { REPORT_HEADER_TITLE_HALF } from "../../lib/reportHeaderTitles";
import type { MonthlyReport } from "../../lib/types/database";
import { dateRangeForPeriodEndingInMonth, halfYearCodeForEndYm } from "../../lib/reportRounds";
import {
  averagesToStoredScores,
  collectHalfYearMonthlySlots,
  computeHalfYearAverages,
  pickGaugePillars,
} from "../../lib/halfYearReportCompute";
import { resolveHalfYearReadingType } from "../../lib/halfYearReadingTypes";
import { generateHalfYearCompetencyCopy, expandHalfYearTeacherComment } from "../../lib/geminiHalfYearReport";
import {
  clampHalfYearGaugeDesc,
  clampHalfYearReadingTypeDesc,
} from "../../lib/halfYearReportCopy";
import { upsertHalfYearReportDraft } from "../../lib/halfYearReportDraftSync";
import { pillarLabelsKo } from "../../lib/reportAggregates";
import {
  applyReportPrivacy,
  buildReportPrivacyContext,
  sanitizeReportStudentPii,
} from "../../lib/reportStudentPrivacy";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { formatSchoolGradeLabel } from "../../lib/schoolGrade";
import type { HalfReportRow } from "../../lib/studentPeriodReportsTypes";
import { HalfYearReportSections, type HalfYearReportViewModel } from "./HalfYearReportSections";

const HALF_WIZARD_STEPS = [
  { id: 1, title: "6개월 역량 분석" },
  { id: 2, title: "우리 아이 독서 유형" },
  { id: 3, title: "선생님의 따뜻한 한마디" },
  { id: 4, title: "레포트 확인 · 저장" },
] as const;

type Props = {
  studentId: string;
  endYm: string;
  reports: MonthlyReport[];
  studentNick: string | null | undefined;
  studentGrade: string | null | undefined;
  enrollmentAnchorYm: string;
  savedHalf?: HalfReportRow | null;
  halves: HalfReportRow[];
};

export function HalfYearReportComposer({
  studentId,
  endYm,
  reports,
  studentNick,
  studentGrade,
  enrollmentAnchorYm,
  savedHalf,
  halves,
}: Props) {
  const navigate = useNavigate();
  const effectiveAnchor = enrollmentAnchorYm;

  const halfRange = useMemo(() => dateRangeForPeriodEndingInMonth(endYm, "6m"), [endYm]);
  const halfCode = useMemo(() => halfYearCodeForEndYm(endYm), [endYm]);
  const halfLabel = useMemo(() => {
    const m = /^(\d{4})-H([12])$/.exec(halfCode);
    if (!m) return halfCode;
    return `${m[1]}년 ${m[2] === "1" ? "상반기" : "하반기"}`;
  }, [halfCode]);

  const reportPrivacy = useMemo(
    () => buildReportPrivacyContext({ studentNick, studentId }),
    [studentNick, studentId],
  );

  const periodGradeLabel = useMemo(() => {
    const raw = (studentGrade ?? "").trim();
    return raw ? formatSchoolGradeLabel(raw) : "학년·급 정보 없음";
  }, [studentGrade]);

  const slots = useMemo(
    () => collectHalfYearMonthlySlots(effectiveAnchor, endYm, reports),
    [effectiveAnchor, endYm, reports],
  );

  const averages = useMemo(() => computeHalfYearAverages(slots), [slots]);
  const storedScores = useMemo(() => averagesToStoredScores(averages), [averages]);
  const gaugePillars = useMemo(() => pickGaugePillars(averages), [averages]);
  const readingTypeResult = useMemo(() => resolveHalfYearReadingType(averages), [averages]);

  const savedHalfForDraft = useMemo(() => {
    if (savedHalf) return savedHalf;
    return halves.find((h) => h.half_year_code === halfCode) ?? null;
  }, [savedHalf, halves, halfCode]);

  const [wizardStep, setWizardStep] = useState(() => (savedHalfForDraft ? 4 : 1));
  const [scoreOverview, setScoreOverview] = useState("");
  const [gaugeHighDesc, setGaugeHighDesc] = useState("");
  const [gaugeLowDesc, setGaugeLowDesc] = useState("");
  const [readingTypeDescription, setReadingTypeDescription] = useState("");
  const [teacherSeed, setTeacherSeed] = useState("");
  const [teacherExpanded, setTeacherExpanded] = useState("");
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisErr, setAnalysisErr] = useState<string | null>(null);
  const [teacherBusy, setTeacherBusy] = useState(false);
  const [teacherErr, setTeacherErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reportEditMode, setReportEditMode] = useState(false);
  const [saveRedirectOpen, setSaveRedirectOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const hydratedRef = useMemo(() => `${studentId}:${savedHalfForDraft?.h_report_id ?? ""}`, [studentId, savedHalfForDraft]);

  useEffect(() => {
    if (!savedHalfForDraft) return;
    const row = savedHalfForDraft;
    setScoreOverview(applyReportPrivacy(row.score_overview ?? "", reportPrivacy));
    setGaugeHighDesc(
      clampHalfYearGaugeDesc(applyReportPrivacy(row.gauge_high_desc ?? "", reportPrivacy)),
    );
    setGaugeLowDesc(clampHalfYearGaugeDesc(applyReportPrivacy(row.gauge_low_desc ?? "", reportPrivacy)));
    setReadingTypeDescription(
      clampHalfYearReadingTypeDesc(applyReportPrivacy(row.type_description ?? "", reportPrivacy)),
    );
    setTeacherExpanded(applyReportPrivacy(row.teacher_comment ?? "", reportPrivacy));
    setWizardStep(4);
  }, [hydratedRef, savedHalfForDraft, reportPrivacy]);

  const monthsWithReports = slots.filter((s) => s.report).length;
  const canAnalyze = monthsWithReports >= 1;

  const viewModel = useMemo((): HalfYearReportViewModel => {
    const high = gaugePillars.high;
    const low = gaugePillars.low;
    return {
      halfLabel,
      scoreOverview,
      gaugeHighLabel: pillarLabelsKo[high],
      gaugeLowLabel: pillarLabelsKo[low],
      gaugeHighDesc: gaugeHighDesc,
      gaugeLowDesc: gaugeLowDesc,
      readingType: readingTypeResult.type
        ? {
            ...readingTypeResult.type,
            description: readingTypeDescription,
          }
        : null,
      teacherComment: teacherExpanded,
      radarAverages: averages,
    };
  }, [
    halfLabel,
    scoreOverview,
    gaugePillars,
    gaugeHighDesc,
    gaugeLowDesc,
    readingTypeResult,
    teacherExpanded,
    averages,
  ]);

  const buildDraftPayload = useCallback(
    (overrides?: { teacher_comment?: string | null }) => ({
      student_id: studentId,
      end_ym: endYm,
      score_reading: storedScores.reading,
      score_thinking: storedScores.thinking,
      score_discussion: storedScores.discussion,
      score_writing: storedScores.writing,
      score_growth: storedScores.growth,
      score_overview: sanitizeReportStudentPii(scoreOverview.trim(), reportPrivacy) || null,
      score_reading_desc: null,
      score_thinking_desc: null,
      score_discussion_desc: null,
      score_writing_desc: null,
      score_growth_desc: null,
      gauge_high_pillar: gaugePillars.high,
      gauge_low_pillar: gaugePillars.low,
      gauge_high_desc:
        sanitizeReportStudentPii(clampHalfYearGaugeDesc(gaugeHighDesc), reportPrivacy) || null,
      gauge_low_desc:
        sanitizeReportStudentPii(clampHalfYearGaugeDesc(gaugeLowDesc), reportPrivacy) || null,
      reading_type_name: readingTypeResult.type.typeName,
      type_logic_code: readingTypeResult.type.code,
      type_description:
        sanitizeReportStudentPii(clampHalfYearReadingTypeDesc(readingTypeDescription), reportPrivacy) ||
        null,
      teacher_comment:
        overrides?.teacher_comment !== undefined
          ? overrides.teacher_comment
          : sanitizeReportStudentPii(teacherExpanded.trim() || teacherSeed.trim(), reportPrivacy) || null,
    }),
    [
      studentId,
      endYm,
      storedScores,
      scoreOverview,
      gaugePillars,
      gaugeHighDesc,
      gaugeLowDesc,
      readingTypeResult,
      readingTypeDescription,
      teacherExpanded,
      teacherSeed,
      reportPrivacy,
    ],
  );

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase || !studentId) return;
    if (wizardStep < 2) return;
    const client = supabase;
    const timer = window.setTimeout(() => {
      void upsertHalfYearReportDraft(client, buildDraftPayload()).catch((e) =>
        console.warn("[반기 초안 동기화]", e),
      );
    }, 900);
    return () => window.clearTimeout(timer);
  }, [wizardStep, buildDraftPayload, studentId]);

  const runCompetencyAnalysis = useCallback(async () => {
    setAnalysisErr(null);
    if (!canAnalyze) {
      setAnalysisErr("6개월 중 월간 레포트가 1건 이상 필요합니다.");
      return;
    }
    setAnalysisBusy(true);
    try {
      const { type: resolvedReadingType } = readingTypeResult;
      const copy = await generateHalfYearCompetencyCopy({
        studentGradeLabel: periodGradeLabel,
        halfLabel,
        slots,
        averages,
        gaugeHigh: gaugePillars.high,
        gaugeLow: gaugePillars.low,
        readingTypeName: resolvedReadingType.typeName,
        privacy: reportPrivacy,
      });
      setScoreOverview(applyReportPrivacy(copy.score_overview, reportPrivacy));
      setGaugeHighDesc(
        clampHalfYearGaugeDesc(applyReportPrivacy(copy.gauge_high_desc, reportPrivacy)),
      );
      setGaugeLowDesc(
        clampHalfYearGaugeDesc(applyReportPrivacy(copy.gauge_low_desc, reportPrivacy)),
      );
      setReadingTypeDescription(
        clampHalfYearReadingTypeDesc(applyReportPrivacy(copy.reading_type_description, reportPrivacy)),
      );
      setWizardStep(2);
    } catch (e) {
      setAnalysisErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalysisBusy(false);
    }
  }, [
    canAnalyze,
    periodGradeLabel,
    halfLabel,
    slots,
    averages,
    gaugePillars,
    readingTypeResult,
    reportPrivacy,
  ]);

  const runTeacherExpand = useCallback(async () => {
    setTeacherErr(null);
    const seed = teacherSeed.trim();
    if (!seed) {
      setTeacherErr("1~2줄 초안을 입력해 주세요.");
      return;
    }
    if (!scoreOverview.trim()) {
      setTeacherErr("1단계 역량 분석을 먼저 생성해 주세요.");
      return;
    }
    setTeacherBusy(true);
    try {
      const expanded = await expandHalfYearTeacherComment({
        studentGradeLabel: periodGradeLabel,
        halfLabel,
        teacherSeed: seed,
        readingType: readingTypeResult.type,
        scoreOverview,
        privacy: reportPrivacy,
      });
      setTeacherExpanded(expanded);
      setWizardStep(4);
      if (isSupabaseConfigured() && supabase) {
        void upsertHalfYearReportDraft(supabase, buildDraftPayload({ teacher_comment: expanded })).catch(
          () => undefined,
        );
      }
    } catch (e) {
      setTeacherErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTeacherBusy(false);
    }
  }, [
    teacherSeed,
    scoreOverview,
    periodGradeLabel,
    halfLabel,
    readingTypeResult,
    reportPrivacy,
    buildDraftPayload,
  ]);

  const step1Ok =
    scoreOverview.trim().length > 0 && Boolean(gaugeHighDesc.trim()) && Boolean(gaugeLowDesc.trim());

  const canExportReport =
    wizardStep === 4 && step1Ok && Boolean(teacherExpanded.trim()) && !reportEditMode;
  const { exportBusy, runExport } = useReportFileExport(canExportReport, REPORT_HEADER_TITLE_HALF);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (wizardStep !== 4) {
      setMsg("마지막 단계에서만 저장할 수 있습니다.");
      return;
    }
    if (!teacherExpanded.trim()) {
      setMsg("선생님 한마디(확장본)를 생성해 주세요.");
      return;
    }
    if (!step1Ok) {
      setMsg("역량 분석 문구가 비어 있습니다. 1단계를 다시 생성해 주세요.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      if (!isSupabaseConfigured() || !supabase) {
        setMsg("저장하려면 Supabase 연결이 필요합니다.");
        return;
      }
      await upsertHalfYearReportDraft(supabase, buildDraftPayload({ teacher_comment: teacherExpanded.trim() }));
      setMsg(null);
      setSaveRedirectOpen(true);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
          ← 학생 상세
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">반기별 리포트 작성</h1>
        <p className="mt-1 text-sm text-slate-600">
          반기 마지막 달 <code className="rounded bg-slate-100 px-1">{endYm}</code> 포함, 이전 5개월·총{" "}
          <strong>6회차</strong> 월간 역량을 사용합니다.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm text-slate-700">
          <p>
            <span className="font-medium text-slate-900">{halfLabel}</span> ({halfCode})
          </p>
          {halfRange ? (
            <p className="mt-1">
              참조 기간: {halfRange.start} ~ {halfRange.end} · 월간 레포트 {monthsWithReports}/6건
            </p>
          ) : null}
        </div>

        <nav aria-label="반기 작성 단계" className="flex flex-wrap gap-1.5">
          {HALF_WIZARD_STEPS.map((s) => {
            const active = wizardStep === s.id;
            const done = wizardStep > s.id;
            const pill = active
              ? "rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white"
              : done
                ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900"
                : "rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600";
            return (
              <button
                key={s.id}
                type="button"
                disabled={!savedHalfForDraft && s.id > wizardStep}
                onClick={() => {
                  if (!savedHalfForDraft && s.id > wizardStep) return;
                  setWizardStep(s.id);
                }}
                className={pill}
              >
                {s.id}. {s.title}
              </button>
            );
          })}
        </nav>

        {wizardStep === 1 ? (
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-800">1. 최근 6개월간의 점수 평균</legend>
            <p className="text-sm text-slate-600">
              6개월 월간 역량을 바탕으로 레이더·게이지와 함께, <strong>3-4회차·5-6회차 구간별</strong> 성장
              서술(2문단)만 생성합니다. 역량별 항목 나열은 하지 않습니다.
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">회차</th>
                    <th className="px-3 py-2">월</th>
                    <th className="px-3 py-2">월간 레포트</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s) => (
                    <tr key={s.ym} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium">{s.round}회</td>
                      <td className="px-3 py-2">{s.ym}</td>
                      <td className="px-3 py-2">{s.report ? "있음" : "없음"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {analysisErr ? <p className="text-sm text-red-600">{analysisErr}</p> : null}
            <button
              type="button"
              disabled={analysisBusy || !canAnalyze}
              onClick={() => void runCompetencyAnalysis()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {analysisBusy ? "분석·문구 생성 중…" : "6개월 역량 분석 생성"}
            </button>
            {step1Ok ? <HalfYearReportSections model={viewModel} /> : null}
          </fieldset>
        ) : null}

        {wizardStep === 2 ? (
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-800">2. 우리 아이 독서 유형</legend>
            <HalfYearReportSections model={viewModel} />
          </fieldset>
        ) : null}

        {wizardStep === 3 ? (
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-800">3. 선생님의 따뜻한 한마디</legend>
            <label className="block text-sm text-slate-700">
              6개월을 돌아보며 느낀 점 (1~2줄)
              <textarea
                value={teacherSeed}
                onChange={(e) => setTeacherSeed(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="예: 늘 밝게 참여하며, 글쓰기에서도 자신감이 커진 것이 인상적이었습니다."
              />
            </label>
            {teacherErr ? <p className="text-sm text-red-600">{teacherErr}</p> : null}
            <button
              type="button"
              disabled={teacherBusy}
              onClick={() => void runTeacherExpand()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {teacherBusy ? "확장 중…" : "따뜻한 한마디 AI 확장"}
            </button>
          </fieldset>
        ) : null}

        {wizardStep === 4 ? (
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-800">4. 레포트 확인 · 저장</legend>
            <HalfYearReportSections
              model={viewModel}
              editMode={reportEditMode}
              onScoreOverviewChange={setScoreOverview}
              onTeacherCommentChange={setTeacherExpanded}
              onGaugeHighDescChange={(v) => setGaugeHighDesc(clampHalfYearGaugeDesc(v))}
              onGaugeLowDescChange={(v) => setGaugeLowDesc(clampHalfYearGaugeDesc(v))}
              onReadingTypeDescriptionChange={(v) =>
                setReadingTypeDescription(clampHalfYearReadingTypeDesc(v))
              }
            />
            <ReportFinalStepActions
              onPrev={() => setWizardStep(3)}
              onRegenerate={() => void runCompetencyAnalysis()}
              regenerateBusy={analysisBusy}
              regenerateDisabled={analysisBusy || !canAnalyze}
              regenerateLabel="역량 분석 다시 생성"
              reportEditMode={reportEditMode}
              onToggleEditMode={() => {
                setMsg(null);
                setReportEditMode((v) => !v);
              }}
              editDisabled={analysisBusy || Boolean(exportBusy)}
              exportBusy={exportBusy}
              exportDisabled={!canExportReport}
              onExportJpg={() => {
                void runExport("jpg").then((err) => {
                  if (err) setMsg(err);
                });
              }}
              onExportPdf={() => {
                void runExport("pdf").then((err) => {
                  if (err) setMsg(err);
                });
              }}
              saveLabel="반기 레포트 저장"
              saving={saving}
            />
          </fieldset>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {wizardStep > 1 ? (
            <button
              type="button"
              onClick={() => setWizardStep((s) => Math.max(1, s - 1))}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              이전
            </button>
          ) : null}
          {wizardStep === 1 && step1Ok ? (
            <button
              type="button"
              onClick={() => setWizardStep(2)}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
            >
              다음 (독서 유형)
            </button>
          ) : null}
          {wizardStep === 2 ? (
            <button
              type="button"
              onClick={() => setWizardStep(3)}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
            >
              다음 (선생님 한마디)
            </button>
          ) : null}
        </div>

        {msg ? <p className="text-center text-sm text-red-600">{msg}</p> : null}
      </form>

      <ReportSaveRedirectDialog
        open={saveRedirectOpen}
        onClose={() => setSaveRedirectOpen(false)}
        onGoStudentDetail={() => {
          setSaveRedirectOpen(false);
          navigate(`/students/${studentId}`, { replace: true });
        }}
        onGoStudentsList={() => {
          setSaveRedirectOpen(false);
          navigate("/students", { replace: true });
        }}
      />
    </div>
  );
}
