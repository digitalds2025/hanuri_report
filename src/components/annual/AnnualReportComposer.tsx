import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MonthlyReport } from "../../lib/types/database";
import { annualTargetYearForEndYm } from "../../lib/reportRounds";
import {
  annualTimelineToJson,
  buildTimelineSlotDisplay,
  parseAnnualTimeline,
} from "../../lib/annualReportTypes";
import {
  annualRoundRangeLabel,
  averagesToStoredScores,
  pillarScoresToYReportColumns,
  collectAnnualMonthlySlots,
  collectBookIdsFromSlots,
  computeAnnualAverages,
  computeBookStatsFromCategories,
  allTwelveMonthsHaveGrowthMoment,
  countMonthsWithGrowthMoment,
  growthMomentsAllMonthsForAi,
} from "../../lib/annualReportCompute";
import { gradeTransitionInfo } from "../../lib/gradeCurriculum";
import {
  generateAnnualCertText,
  generateAnnualTimelineCopy,
  generateAnnualWarmSectionCopy,
  mergeTimelineWithAi,
} from "../../lib/geminiAnnualReport";
import { mergeWarmSectionFromSaved } from "../../lib/annualWarmSection";
import { upsertAnnualReportDraft } from "../../lib/annualReportDraftSync";
import {
  buildReportPrivacyContext,
  sanitizeReportStudentPii,
} from "../../lib/reportStudentPrivacy";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { formatSchoolGradeLabel } from "../../lib/schoolGrade";
import type { YearReportRow } from "../../lib/studentPeriodReportsTypes";
import {
  AnnualReportSections,
  timelineMonthsFromJson,
  type AnnualReportViewModel,
} from "./AnnualReportSections";

const ANNUAL_WIZARD_STEPS = [
  { id: 1, title: "연간 타임라인" },
  { id: 2, title: "도서 데이터" },
  { id: 3, title: "선생님의 따뜻한 한마디" },
  { id: 4, title: "레포트 확인 · 저장" },
] as const;

type Props = {
  studentId: string;
  /** 12회차 달 YYYY-MM — DB target_year·수료일 계산용 */
  endYm: string;
  /** 학생 등록월 YYYY-MM — 1~12회차 달 매칭 */
  enrollmentAnchorYm: string;
  reports: MonthlyReport[];
  studentNick?: string | null;
  studentGrade: string | null | undefined;
  savedYear?: YearReportRow | null;
  years: YearReportRow[];
};

function formatCertDate(targetYear: number): string {
  return `${targetYear}.12.31`;
}

export function AnnualReportComposer({
  studentId,
  endYm,
  enrollmentAnchorYm,
  reports,
  studentNick,
  studentGrade,
  savedYear,
  years,
}: Props) {
  const targetYear = useMemo(() => annualTargetYearForEndYm(endYm), [endYm]);
  const yearLabel = `${targetYear}년`;

  const reportPrivacy = useMemo(
    () => buildReportPrivacyContext({ studentId, studentNick }),
    [studentId, studentNick],
  );

  const periodGradeLabel = useMemo(() => {
    const raw = (studentGrade ?? "").trim();
    return raw ? formatSchoolGradeLabel(raw) : "학년·급 정보 없음";
  }, [studentGrade]);

  const gradeCode = (studentGrade ?? "").trim().toUpperCase();
  const transition = useMemo(() => gradeTransitionInfo(gradeCode), [gradeCode]);

  const windowLabel = useMemo(
    () => (enrollmentAnchorYm ? annualRoundRangeLabel(enrollmentAnchorYm) : endYm),
    [enrollmentAnchorYm, endYm],
  );
  const slots = useMemo(
    () => (enrollmentAnchorYm ? collectAnnualMonthlySlots(enrollmentAnchorYm, reports) : []),
    [enrollmentAnchorYm, reports],
  );
  const averages = useMemo(() => computeAnnualAverages(slots), [slots]);
  const storedScores = useMemo(() => averagesToStoredScores(averages), [averages]);
  const growthByMonth = useMemo(() => growthMomentsAllMonthsForAi(slots), [slots]);
  const monthsWithGrowth = useMemo(() => countMonthsWithGrowthMoment(slots), [slots]);
  const hasAllTwelveGrowth = useMemo(() => allTwelveMonthsHaveGrowthMoment(slots), [slots]);

  const savedYearForDraft = useMemo(() => {
    if (savedYear) return savedYear;
    return years.find((y) => y.target_year === targetYear) ?? null;
  }, [savedYear, years, targetYear]);

  const [wizardStep, setWizardStep] = useState(() => (savedYearForDraft ? 4 : 1));
  const [timelineMonths, setTimelineMonths] = useState<Record<number, string>>(() => {
    const parsed = parseAnnualTimeline(savedYearForDraft?.annual_timeline);
    return timelineMonthsFromJson(parsed.months);
  });
  const [outlook, setOutlook] = useState(
    () =>
      savedYearForDraft?.outlook_comment?.trim() ||
      parseAnnualTimeline(savedYearForDraft?.annual_timeline).outlook ||
      "",
  );
  const [bookStats, setBookStats] = useState({
    total: savedYearForDraft?.total_books ?? 0,
    litCount: savedYearForDraft?.book_lit_count ?? 0,
    nonLitCount: savedYearForDraft?.book_non_lit_count ?? 0,
    litRatio: savedYearForDraft?.lit_ratio ?? 0,
    nonLitRatio: savedYearForDraft?.non_lit_ratio ?? 0,
  });
  const [warmSectionText, setWarmSectionText] = useState(() =>
    mergeWarmSectionFromSaved(savedYearForDraft?.roadmap_text, savedYearForDraft?.teacher_comment),
  );
  const [teacherSeed, setTeacherSeed] = useState("");
  const [certText, setCertText] = useState(savedYearForDraft?.cert_text ?? "");
  const [certGradeLabel, setCertGradeLabel] = useState(
    () => savedYearForDraft?.cert_grade_label?.trim() || periodGradeLabel,
  );

  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineErr, setTimelineErr] = useState<string | null>(null);
  const [booksLoading, setBooksLoading] = useState(false);
  const [warmSectionBusy, setWarmSectionBusy] = useState(false);
  const [warmSectionErr, setWarmSectionErr] = useState<string | null>(null);
  const [certBusy, setCertBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadBookStats = useCallback(async () => {
    const ids = collectBookIdsFromSlots(slots);
    if (!ids.length) {
      setBookStats({ total: 0, litCount: 0, nonLitCount: 0, litRatio: 0, nonLitRatio: 0 });
      return;
    }
    if (!isSupabaseConfigured() || !supabase) return;
    setBooksLoading(true);
    try {
      const { data, error } = await supabase.from("books").select("id, ai_category").in("id", ids);
      if (error) throw new Error(error.message);
      const map = new Map<string, string | null>();
      for (const row of data ?? []) {
        map.set(String(row.id), (row.ai_category as string | null) ?? null);
      }
      const stats = computeBookStatsFromCategories(ids, map);
      setBookStats({
        total: stats.total,
        litCount: stats.litCount,
        nonLitCount: stats.nonLitCount,
        litRatio: stats.litRatio,
        nonLitRatio: stats.nonLitRatio,
      });
    } catch (e) {
      console.warn("[연간 도서 집계]", e);
    } finally {
      setBooksLoading(false);
    }
  }, [slots]);

  useEffect(() => {
    void loadBookStats();
  }, [loadBookStats]);

  const buildDraftPayload = useCallback(
    (overrides?: Partial<{ teacher_comment: string | null }>) => {
      const timelineJson = annualTimelineToJson({
        months: Object.fromEntries(
          Array.from({ length: 12 }, (_, i) => [String(i + 1), (timelineMonths[i + 1] ?? "").trim()]),
        ),
        outlook: outlook.trim() || undefined,
      });
      return {
        student_id: studentId,
        end_ym: endYm,
        ...pillarScoresToYReportColumns(storedScores),
        annual_timeline: timelineJson,
        outlook_comment: outlook.trim() || null,
        total_books: bookStats.total,
        lit_ratio: bookStats.litRatio,
        non_lit_ratio: bookStats.nonLitRatio,
        book_lit_count: bookStats.litCount,
        book_non_lit_count: bookStats.nonLitCount,
        roadmap_text: null,
        teacher_comment:
          overrides?.teacher_comment !== undefined
            ? overrides.teacher_comment
            : sanitizeReportStudentPii(warmSectionText.trim(), reportPrivacy) || null,
        cert_text: sanitizeReportStudentPii(certText.trim(), reportPrivacy) || null,
        cert_grade_label: certGradeLabel.trim() || null,
        is_certified: true,
      };
    },
    [
      studentId,
      endYm,
      storedScores,
      timelineMonths,
      outlook,
      bookStats,
      warmSectionText,
      certText,
      certGradeLabel,
      reportPrivacy,
    ],
  );

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase || !studentId) return;
    if (wizardStep < 2) return;
    const client = supabase;
    const timer = window.setTimeout(() => {
      void upsertAnnualReportDraft(client, buildDraftPayload()).catch((e) =>
        console.warn("[연간 초안 동기화]", e),
      );
    }, 900);
    return () => window.clearTimeout(timer);
  }, [wizardStep, buildDraftPayload, studentId]);

  const viewModel = useMemo((): AnnualReportViewModel => {
    return {
      yearLabel,
      windowLabel,
      timelineSlots: buildTimelineSlotDisplay(slots, timelineMonths),
      outlook,
      totalBooks: bookStats.total,
      litCount: bookStats.litCount,
      nonLitCount: bookStats.nonLitCount,
      litRatio: bookStats.litRatio,
      nonLitRatio: bookStats.nonLitRatio,
      warmSectionText,
      certText,
      certGradeLabel,
      certDateLabel: formatCertDate(targetYear),
    };
  }, [
    yearLabel,
    windowLabel,
    slots,
    timelineMonths,
    outlook,
    bookStats,
    warmSectionText,
    certText,
    certGradeLabel,
    targetYear,
  ]);

  const runTimelineAi = useCallback(async () => {
    setTimelineErr(null);
    setTimelineBusy(true);
    try {
      const ai = await generateAnnualTimelineCopy({
        targetYear,
        windowLabel,
        growthByMonth,
        privacy: reportPrivacy,
      });
      const merged = mergeTimelineWithAi(parseAnnualTimeline(null), ai);
      setTimelineMonths(timelineMonthsFromJson(merged.months));
      setOutlook(merged.outlook ?? ai.outlook);
      setWizardStep(2);
    } catch (e) {
      setTimelineErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTimelineBusy(false);
    }
  }, [targetYear, windowLabel, growthByMonth, reportPrivacy]);

  const runWarmSectionAndCert = useCallback(async () => {
    setWarmSectionErr(null);
    const seed = teacherSeed.trim();
    if (!seed) {
      setWarmSectionErr("선생님 한마디 초안 1~2줄을 입력해 주세요.");
      return;
    }
    setWarmSectionBusy(true);
    try {
      const [warmSection, cert] = await Promise.all([
        generateAnnualWarmSectionCopy({
          targetYear,
          studentGradeLabel: periodGradeLabel,
          teacherSeed: seed,
          transition,
          pillarAverages: averages,
          privacy: reportPrivacy,
        }),
        certText.trim()
          ? Promise.resolve(certText)
          : generateAnnualCertText({
              targetYear,
              certGradeLabel: certGradeLabel.trim() || periodGradeLabel,
              teacherHint: seed,
              privacy: reportPrivacy,
            }),
      ]);
      setWarmSectionText(warmSection);
      if (!certText.trim()) setCertText(cert);
      setWizardStep(4);
      if (isSupabaseConfigured() && supabase) {
        void upsertAnnualReportDraft(
          supabase,
          buildDraftPayload({ teacher_comment: warmSection }),
        ).catch(() => undefined);
      }
    } catch (e) {
      setWarmSectionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setWarmSectionBusy(false);
    }
  }, [
    teacherSeed,
    certText,
    targetYear,
    periodGradeLabel,
    transition,
    averages,
    certGradeLabel,
    reportPrivacy,
    buildDraftPayload,
  ]);

  const regenerateCert = useCallback(async () => {
    setCertBusy(true);
    try {
      const cert = await generateAnnualCertText({
        targetYear,
        certGradeLabel: certGradeLabel.trim() || periodGradeLabel,
        teacherHint: teacherSeed.trim() || warmSectionText.slice(0, 200),
        privacy: reportPrivacy,
      });
      setCertText(cert);
    } catch (e) {
      setWarmSectionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCertBusy(false);
    }
  }, [targetYear, certGradeLabel, periodGradeLabel, teacherSeed, warmSectionText, reportPrivacy]);

  const summarizedMonthCount = useMemo(
    () => Array.from({ length: 12 }, (_, i) => (timelineMonths[i + 1] ?? "").trim()).filter(Boolean).length,
    [timelineMonths],
  );

  const step1Ok =
    summarizedMonthCount === 12 && outlook.trim().length > 0 && hasAllTwelveGrowth;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (wizardStep !== 4) {
      setMsg("마지막 단계에서만 저장할 수 있습니다.");
      return;
    }
    if (!warmSectionText.trim()) {
      setMsg("「선생님의 따뜻한 한마디」본문을 작성해 주세요.");
      return;
    }
    if (!step1Ok) {
      setMsg(
        hasAllTwelveGrowth
          ? "연간 타임라인 12칸·전망 코멘트를 모두 생성해 주세요."
          : "12개월 월간 리포트(성장 모멘트)를 모두 작성한 뒤, AI 타임라인을 다시 생성해 주세요.",
      );
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      if (!isSupabaseConfigured() || !supabase) {
        setMsg("저장하려면 Supabase 연결이 필요합니다.");
        return;
      }
      await upsertAnnualReportDraft(supabase, buildDraftPayload());
      setMsg("연간 레포트가 저장되었습니다.");
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
        <h1 className="mt-1 text-2xl font-bold text-slate-900">연간 레포트 작성</h1>
        <p className="mt-1 text-sm text-slate-600">
          구간 <code className="rounded bg-slate-100 px-1">{windowLabel}</code> ·{" "}
          <strong>월간 리포트(m_reports.growth_moment)</strong> 매칭: <strong>{monthsWithGrowth}</strong>/12
          {!hasAllTwelveGrowth ? (
            <span className="ml-1 text-amber-700">
              — 1~12회차 각각 월간 리포트(성장 모멘트)가 있어야 합니다.
            </span>
          ) : null}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <nav aria-label="연간 작성 단계" className="flex flex-wrap gap-1.5">
          {ANNUAL_WIZARD_STEPS.map((s) => {
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
                disabled={!savedYearForDraft && s.id > wizardStep}
                onClick={() => {
                  if (!savedYearForDraft && s.id > wizardStep) return;
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
            <legend className="text-sm font-semibold text-slate-800">1. 연간 타임라인</legend>
            <p className="text-sm text-slate-600">
              Supabase <code className="text-xs">m_reports.growth_moment</code>(월간 피드백) 원문을 월별로 AI가 20~45자
              한 줄로 압축합니다. 6×2 표(1~6월 / 7~12월)에 채워지며, 하단에 1년 성장 곡선·내년 기대 전망이 붙습니다.
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200 text-xs">
              <table className="min-w-full">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-1.5 text-left">회차</th>
                    <th className="px-2 py-1.5 text-left">월 (YYYY-MM)</th>
                    <th className="px-2 py-1.5 text-left">월간 리포트</th>
                    <th className="px-2 py-1.5 text-left">성장 모멘트</th>
                  </tr>
                </thead>
                <tbody>
                  {growthByMonth.map((row) => (
                    <tr key={row.ym} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-medium">{row.slotIndex}회차</td>
                      <td className="px-2 py-1.5 font-mono text-[11px]">{row.ym}</td>
                      <td className="px-2 py-1.5">{row.sourceText ? "있음" : "없음"}</td>
                      <td className="max-w-md truncate px-2 py-1.5 text-slate-600" title={row.sourceText}>
                        {row.sourceText ? `${row.sourceText.slice(0, 48)}…` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!hasAllTwelveGrowth ? (
              <p className="text-sm text-amber-800">
                {12 - monthsWithGrowth}개월 월간 리포트가 비어 있습니다. 먼저 해당 달 월간 레포트를 작성한 뒤 다시
                생성하세요.
              </p>
            ) : null}
            <button
              type="button"
              disabled={timelineBusy}
              onClick={() => void runTimelineAi()}
              className="rounded-md bg-[#1a3b6b] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a5b9c] disabled:opacity-50"
            >
              {timelineBusy ? "생성 중…" : "AI 타임라인 · 전망 생성"}
            </button>
            {timelineErr ? <p className="text-sm text-red-600">{timelineErr}</p> : null}
            {summarizedMonthCount > 0 ? (
              <p className="text-sm text-slate-600">
                AI 요약 반영: <strong>{summarizedMonthCount}</strong>/12칸 · 전망:{" "}
                {outlook.trim() ? "있음" : "없음"}
              </p>
            ) : null}
            {step1Ok ? (
              <button
                type="button"
                className="text-sm text-indigo-600 hover:underline"
                onClick={() => setWizardStep(2)}
              >
                다음: 도서 데이터 →
              </button>
            ) : summarizedMonthCount > 0 && !step1Ok ? (
              <p className="text-sm text-amber-800">12칸 모두 한 줄 요약·전망이 채워져야 다음 단계로 진행할 수 있습니다.</p>
            ) : null}
          </fieldset>
        ) : null}

        {wizardStep === 2 ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">2. 도서 데이터</legend>
            <p className="text-sm text-slate-600">
              {booksLoading
                ? "도서 집계 중…"
                : `총 ${bookStats.total}권 · 문학 ${bookStats.litCount}권(${bookStats.litRatio}%) · 비문학 ${bookStats.nonLitCount}권(${bookStats.nonLitRatio}%)`}
            </p>
            <button type="button" className="text-sm text-indigo-600 hover:underline" onClick={() => setWizardStep(3)}>
              다음: 선생님의 따뜻한 한마디 →
            </button>
          </fieldset>
        ) : null}

        {wizardStep === 3 ? (
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-800">3. 선생님의 따뜻한 한마디</legend>
            <p className="text-sm text-slate-600">
              미래 로드맵(다음 학년·한우리 비전)과 따뜻한 한마디가 <strong>한 섹션·한 본문</strong>으로 생성됩니다.
              {transition ? (
                <>
                  {" "}
                  ({transition.fromLabel} → {transition.toLabel}: {transition.curriculumHighlights.join(", ")})
                </>
              ) : null}
            </p>
            <label className="block text-sm text-slate-700">
              선생님 초안 (필수, 1~2줄)
              <textarea
                className="mt-1 w-full min-h-[80px] rounded-md border border-gray-200 px-3 py-2 text-sm"
                value={teacherSeed}
                onChange={(e) => setTeacherSeed(e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-700">
              섹션 본문 (로드맵 + 한마디 통합 — 직접 수정 가능)
              <textarea
                className="mt-1 w-full min-h-[240px] rounded-md border border-gray-200 px-3 py-2 text-sm leading-relaxed"
                value={warmSectionText}
                onChange={(e) => setWarmSectionText(e.target.value)}
                placeholder="AI 생성 후 한 편의 글로 편집합니다."
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={warmSectionBusy}
                onClick={() => void runWarmSectionAndCert()}
                className="rounded-md bg-[#1a3b6b] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a5b9c] disabled:opacity-50"
              >
                {warmSectionBusy ? "생성 중…" : "AI 본문 · 수료증 생성"}
              </button>
            </div>
            {warmSectionErr ? <p className="text-sm text-red-600">{warmSectionErr}</p> : null}
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-800">4. 수료 인증서</p>
              <label className="mt-2 block text-sm text-slate-700">
                수료증 학년 표기
                <input
                  className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  value={certGradeLabel}
                  onChange={(e) => setCertGradeLabel(e.target.value)}
                />
              </label>
              <label className="mt-2 block text-sm text-slate-700">
                수료증 문구 (【이름】은 교사가 직접 입력)
                <textarea
                  className="mt-1 w-full min-h-[100px] rounded-md border border-gray-200 px-3 py-2 text-sm"
                  value={certText}
                  onChange={(e) => setCertText(e.target.value)}
                  placeholder="예: 1년의 긴 여정을 멋지게 완주한 ○○○의 성장을 축하하며…"
                />
              </label>
              <button
                type="button"
                disabled={certBusy}
                onClick={() => void regenerateCert()}
                className="mt-2 rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                수료증 문구만 다시 생성
              </button>
            </div>
            {warmSectionText.trim() ? (
              <button
                type="button"
                className="text-sm text-indigo-600 hover:underline"
                onClick={() => setWizardStep(4)}
              >
                다음: 레포트 확인 · 저장 →
              </button>
            ) : null}
          </fieldset>
        ) : null}

        {wizardStep >= 2 && wizardStep <= 4 ? (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-3 text-xs font-medium uppercase text-slate-500">미리보기</p>
            <AnnualReportSections model={viewModel} />
          </div>
        ) : null}

        {wizardStep === 4 ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "연간 레포트 저장"}
            </button>
            {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
