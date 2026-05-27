import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  KOREA_REGIONS,
  REGION_NAMES,
  type ParentAudience,
  type SchoolLevel,
} from "../config/koreaRegions";
import { BriefingStorylinePanel } from "../components/briefing/BriefingStorylinePanel";
import { GammaSlideStudio } from "../components/briefing/GammaSlideStudio";
import { OfficialScanResultsPanel } from "../components/briefing/OfficialScanResultsPanel";
import { ManuscriptReviewPage } from "../components/briefing/ManuscriptReviewPage";
import { SlidePlanReviewPage } from "../components/briefing/SlidePlanReviewPage";
import { TokenUsagePanel } from "../components/briefing/TokenUsagePanel";
import { extractTextFromFiles } from "../lib/briefingFileExtract";
import { buildStorylineBriefForTopic } from "../lib/briefingStorylineBrief";
import type {
  BriefingFoundationReport,
  BriefingLayoutSlide,
  BriefingSlidePlan,
  BriefingStorylineBrief,
  BriefingTopicCandidate,
  MasterOutline,
} from "../lib/briefingMaterialTypes";
import { localEduToFormInput } from "../lib/localEdu/dataLayer";
import {
  buildInstructorGuideMarkdown,
  buildPptxBlob,
  downloadBlob,
  downloadTextFile,
} from "../lib/briefingPptxExport";
import {
  defaultTargetGrade,
  purposeLabel,
  targetGradesForLevel,
} from "../lib/geminiBriefingKit";
import {
  CORE_TOPIC_OPTIONS,
  buildDocxMarkdown,
  layoutSlidesToPptxPayload,
  runLocalEduDataScan,
  runLocalEduSlidePlanning,
  runLocalEduSlideProduction,
  runLocalEduTopicRecommend,
  runLocalEduWriteManuscript,
  type CoreTopicId,
  type LocalEduGenerationOutput,
  type LocalEduInput,
  type LocalEduDataLayerResult,
  type LocalEduTokenLedger,
  emptyTokenLedger,
} from "../lib/localEdu";
import { getDataCollectionPlan } from "../lib/localEdu/dataMatrix";
import type { TargetGrade } from "../lib/briefingMaterialTypes";
import type { BrandIntensity, ToneStyle } from "../lib/localEdu/types";

type WizardStep = "input" | "data" | "topic" | "manuscript" | "plan" | "studio";

const SCHOOL_LEVELS: SchoolLevel[] = ["초등", "중등", "고등"];
const PARENT_TYPES: ParentAudience[] = ["신입 모집", "기존 학생"];
type PurposeMode = "preset" | "custom";

function buildLocalEduInput(
  region: string,
  subRegion: string,
  schoolLevel: SchoolLevel,
  targetGrade: TargetGrade,
  purpose: ParentAudience,
  purposeMode: PurposeMode,
  purposeCustom: string,
  coreTopics: CoreTopicId[],
  eventDate: string,
  centerName: string,
  brandIntensity: BrandIntensity,
  tone: ToneStyle,
  pageCount: number,
): LocalEduInput {
  return {
    region,
    subRegion,
    schoolLevel,
    targetGrade,
    parentAudience: purpose,
    ...(purposeMode === "custom" && purposeCustom.trim()
      ? { purposeCustom: purposeCustom.trim() }
      : {}),
    coreTopics,
    eventDate: eventDate || undefined,
    centerName: centerName || undefined,
    brandIntensity,
    tone,
    pageCount,
  };
}

export function BriefingMaterialPage() {
  const [step, setStep] = useState<WizardStep>("input");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [region, setRegion] = useState("경기");
  const [subRegion, setSubRegion] = useState("의왕시");
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel>("초등");
  const [targetGrade, setTargetGrade] = useState<TargetGrade>("초6");
  const [purpose, setPurpose] = useState<ParentAudience>("신입 모집");
  const [purposeMode, setPurposeMode] = useState<PurposeMode>("preset");
  const [purposeCustom, setPurposeCustom] = useState("");
  const [coreTopics, setCoreTopics] = useState<CoreTopicId[]>([
    "school_info",
    "performance_literacy",
  ]);
  const [eventDate, setEventDate] = useState("");
  const [centerName, setCenterName] = useState("");
  const [brandIntensity, setBrandIntensity] = useState<BrandIntensity>("중");
  const [tone, setTone] = useState<ToneStyle>("안내형");
  const [pageCount, setPageCount] = useState(18);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);

  const [data, setData] = useState<LocalEduDataLayerResult | null>(null);
  const [topics, setTopics] = useState<BriefingTopicCandidate[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [generation, setGeneration] = useState<LocalEduGenerationOutput | null>(null);
  const [masterOutline, setMasterOutline] = useState<MasterOutline | null>(null);
  const [slidePlans, setSlidePlans] = useState<BriefingSlidePlan[]>([]);
  const [editableSlides, setEditableSlides] = useState<BriefingLayoutSlide[]>([]);
  const [attachmentText, setAttachmentText] = useState("");
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [tokenLedger, setTokenLedger] = useState<LocalEduTokenLedger>(emptyTokenLedger());
  const [storylineBrief, setStorylineBrief] = useState<BriefingStorylineBrief | null>(null);
  const [storylineLoading, setStorylineLoading] = useState(false);
  const [foundationReport, setFoundationReport] = useState<BriefingFoundationReport | null>(null);

  const subRegions = useMemo(() => KOREA_REGIONS[region] ?? [], [region]);
  const gradeOptions = useMemo(() => targetGradesForLevel(schoolLevel), [schoolLevel]);
  const dataPlan = useMemo(
    () =>
      buildLocalEduInput(
        region,
        subRegion,
        schoolLevel,
        targetGrade,
        purpose,
        purposeMode,
        purposeCustom,
        coreTopics,
        eventDate,
        centerName,
        brandIntensity,
        tone,
        pageCount,
      ),
    [
      region,
      subRegion,
      schoolLevel,
      targetGrade,
      purpose,
      purposeMode,
      purposeCustom,
      coreTopics,
      eventDate,
      centerName,
      brandIntensity,
      tone,
      pageCount,
    ],
  );
  const branchPlan = useMemo(() => getDataCollectionPlan(dataPlan), [dataPlan]);
  const selectedTopic = topics.find((t) => t.id === selectedTopicId) ?? null;
  const purposeCustomTrimmed = purposeCustom.trim();
  const purposeReady =
    purposeMode === "preset" || purposeCustomTrimmed.length >= 2;

  useEffect(() => {
    if (!gradeOptions.includes(targetGrade)) {
      setTargetGrade(defaultTargetGrade(schoolLevel));
    }
  }, [schoolLevel, gradeOptions, targetGrade]);

  useEffect(() => {
    if (!data || !selectedTopic) {
      setStorylineBrief(null);
      return;
    }
    let cancelled = false;
    setStorylineLoading(true);
    const form = localEduToFormInput(dataPlan, attachmentNames);
    const formWithScan = { ...form, officialScan: data.scan };
    void buildStorylineBriefForTopic(formWithScan, selectedTopic, pageCount)
      .then(({ brief }) => {
        if (!cancelled) setStorylineBrief(brief);
      })
      .catch(() => {
        if (!cancelled) setStorylineBrief(null);
      })
      .finally(() => {
        if (!cancelled) setStorylineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTopicId, pageCount, data, dataPlan, attachmentNames, selectedTopic]);

  function toggleTopic(id: CoreTopicId) {
    setCoreTopics((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleDataLayerStart() {
    setErr(null);
    setBusy(true);
    setData(null);
    setTopics([]);
      setGeneration(null);
      setMasterOutline(null);
      setSlidePlans([]);
      setStorylineBrief(null);
      setFoundationReport(null);
      setSelectedTopicId(null);
    try {
      let attachText = "";
      let names: string[] = [];
      if (attachFiles.length > 0) {
        setStatus("첨부 파일 분석 중…");
        const extracted = await extractTextFromFiles(attachFiles);
        attachText = extracted.text;
        names = extracted.names;
        setAttachmentText(attachText);
        setAttachmentNames(names);
      }

      const result = await runLocalEduDataScan(
        dataPlan,
        attachText,
        names,
        (p) => {
          const detail = p.batchLabel
            ? `${p.batchLabel}${p.queryCount ? ` · ${p.queryCount}개` : ""}`
            : p.phase;
          setStatus(`Data Layer · ${detail}`);
        },
      );
      setData(result);
      setTokenLedger(result.tokenLedger);

      setStatus("Design Layer · 주제 추천·5대 점수");
      const { topics: t, tokenLedger: ledgerAfterTopics } = await runLocalEduTopicRecommend(
        dataPlan,
        result,
        attachText,
      );
      setTopics(t);
      setTokenLedger(ledgerAfterTopics);
      setSelectedTopicId(t[0]?.id ?? null);
      setStep("data");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function handleWriteManuscript() {
    if (!data || !selectedTopic) return;
    setErr(null);
    setBusy(true);
    setFoundationReport(null);
    try {
      const { report, tokenLedger: ledger } = await runLocalEduWriteManuscript(
        dataPlan,
        data,
        selectedTopic,
        attachmentText,
        attachmentNames,
        (p) => setStatus(`${p.layer}: ${p.message}`),
      );
      setFoundationReport(report);
      setTokenLedger(ledger);
      setStep("manuscript");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function handleStartSlidePlanning() {
    if (!data || !selectedTopic || !foundationReport) return;
    setErr(null);
    setBusy(true);
    setStep("plan");
    setSlidePlans([]);
    setMasterOutline(null);
    setGeneration(null);
    setEditableSlides([]);
    try {
      const planning = await runLocalEduSlidePlanning(
        dataPlan,
        data,
        selectedTopic,
        foundationReport,
        attachmentText,
        attachmentNames,
        storylineBrief,
        tokenLedger,
        (p) => setStatus(`${p.layer}: ${p.message}`),
      );
      setMasterOutline(planning.outline);
      setSlidePlans(planning.slidePlans);
      setTokenLedger(planning.tokenLedger);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStep("manuscript");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function handleProduceSlides() {
    if (!data || !selectedTopic || !masterOutline || slidePlans.length === 0) return;
    setErr(null);
    setBusy(true);
    setStep("studio");
    setEditableSlides([]);
    setGeneration(null);
    try {
      const gen = await runLocalEduSlideProduction(
        dataPlan,
        data,
        selectedTopic,
        masterOutline,
        slidePlans,
        attachmentText,
        attachmentNames,
        tokenLedger,
        (p) => setStatus(`${p.layer}: ${p.message}`),
      );
      setGeneration(gen);
      setEditableSlides(gen.slides);
      setTokenLedger(gen.tokenLedger);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  const downloadAll = useCallback(async () => {
    if (!generation || editableSlides.length === 0) return;
    setExportBusy(true);
    try {
    const safeName = `${subRegion}_${targetGrade}_LocalEdu`.replace(/\s+/g, "_");
    const payload = layoutSlidesToPptxPayload(
      editableSlides,
      generation.outline.topicTitle,
    );
    const blob = await buildPptxBlob(payload);
    downloadBlob(blob, `${safeName}.pptx`);
    downloadTextFile(
      buildInstructorGuideMarkdown(payload),
      `${safeName}_강사가이드.md`,
    );
    downloadTextFile(
      buildDocxMarkdown(generation.outline, generation.docxSections),
      `${safeName}_자료집.md`,
    );
    downloadTextFile(
      [
        generation.consultKit.onePageSummaryMd,
        "",
        generation.consultKit.questionListMd,
        "",
        generation.consultKit.kakaoMessageMd,
      ].join("\n"),
      `${safeName}_상담키트.md`,
    );
    if (data) {
      downloadTextFile(data.corpusMarkdown, `${safeName}_리서치원본.md`);
    }
    } finally {
      setExportBusy(false);
    }
  }, [generation, editableSlides, data, subRegion, targetGrade]);

  const downloadPptxOnly = useCallback(async () => {
    if (!generation || editableSlides.length === 0) return;
    setExportBusy(true);
    try {
      const safeName = `${subRegion}_${targetGrade}_LocalEdu`.replace(/\s+/g, "_");
      const payload = layoutSlidesToPptxPayload(
        editableSlides,
        generation.outline.topicTitle,
      );
      const blob = await buildPptxBlob(payload);
      downloadBlob(blob, `${safeName}.pptx`);
      downloadTextFile(
        buildInstructorGuideMarkdown(payload),
        `${safeName}_강사가이드.md`,
      );
    } finally {
      setExportBusy(false);
    }
  }, [generation, editableSlides, subRegion, targetGrade]);

  const stepLabels: Record<WizardStep, string> = {
    input: "1. 조건",
    data: "2. 데이터",
    topic: "3. 주제",
    manuscript: "4. 줄글 검토",
    plan: "5. 슬라이드 기획",
    studio: "6. 편집·보내기",
  };

  if (step === "manuscript" && data && selectedTopic && foundationReport) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
        <Link to="/" className="mb-4 inline-block text-xs text-indigo-600 hover:underline">
          ← 홈
        </Link>
        <ManuscriptReviewPage
          input={dataPlan}
          data={data}
          topic={selectedTopic}
          report={foundationReport}
          onReportChange={(r) => setFoundationReport(r)}
          attachmentNames={attachmentNames}
          tokenLedger={tokenLedger}
          busy={busy}
          status={status}
          error={err}
          onRegenerate={() => void handleWriteManuscript()}
          onContinue={() => void handleStartSlidePlanning()}
          onBack={() => setStep("topic")}
        />
      </div>
    );
  }

  if (step === "plan") {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
        <Link to="/" className="mb-4 inline-block text-xs text-indigo-600 hover:underline">
          ← 홈
        </Link>
        <SlidePlanReviewPage
          topicTitle={masterOutline?.topicTitle ?? selectedTopic?.title ?? "설명회"}
          targetSlideCount={pageCount}
          dataAsOf={masterOutline?.dataAsOf ?? ""}
          plans={slidePlans}
          onPlansChange={setSlidePlans}
          tokenLedger={tokenLedger}
          busy={busy}
          status={status}
          error={err}
          onProduce={() => void handleProduceSlides()}
          onBack={() => setStep("manuscript")}
        />
      </div>
    );
  }

  if (step === "studio") {
    return (
      <GammaSlideStudio
        title={generation?.outline.topicTitle ?? selectedTopic?.title ?? "설명회 자료"}
        slides={editableSlides}
        onSlidesChange={setEditableSlides}
        guardrail={generation?.guardrail ?? null}
        tokenLedger={tokenLedger}
        isGenerating={busy}
        generateStatus={status}
        generateError={err}
        busyExport={exportBusy}
        onExportPptx={() => downloadPptxOnly()}
        onExportBundle={() => downloadAll()}
        onBack={() => setStep("plan")}
        onRetry={selectedTopic && slidePlans.length ? () => void handleProduceSlides() : undefined}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">로컬에듀 마스터</h1>
        <p className="mt-1 text-sm text-slate-600">
          LocalEdu Master — 지역 맞춤 설명회·상담 자료 반자동 생성
        </p>
        <p className="mt-2 text-xs text-slate-500">
          수집 → 주제 선택 → 줄글 검토 → 슬라이드 기획 → 제작
        </p>
        <Link to="/" className="mt-2 inline-block text-xs text-indigo-600 hover:underline">
          ← 홈
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-500">
        {(Object.keys(stepLabels) as WizardStep[]).map((s, i, arr) => (
          <span key={s} className="flex items-center gap-2">
            <span className={step === s ? "text-indigo-600" : ""}>{stepLabels[s]}</span>
            {i < arr.length - 1 ? "→" : null}
          </span>
        ))}
      </div>

      {step === "input" ? (
        <div className="space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
          <section>
            <h2 className="text-sm font-bold text-slate-800">Input Layer · 필수 조건</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold">시·도</label>
                <select
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                    setSubRegion(KOREA_REGIONS[e.target.value]?.[0] ?? "");
                  }}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {REGION_NAMES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">시·군·구</label>
                <select
                  value={subRegion}
                  onChange={(e) => setSubRegion(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {subRegions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">대상 (학교급)</label>
                <select
                  value={schoolLevel}
                  onChange={(e) => setSchoolLevel(e.target.value as SchoolLevel)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {SCHOOL_LEVELS.map((lv) => (
                    <option key={lv} value={lv}>
                      {lv}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">세부 학년</label>
                <select
                  value={targetGrade}
                  onChange={(e) => setTargetGrade(e.target.value as TargetGrade)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {gradeOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section>
            <span className="mb-2 block text-sm font-semibold">목적</span>
            <div className="flex flex-wrap gap-4">
              {PARENT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="le-purpose"
                    checked={purposeMode === "preset" && purpose === t}
                    onChange={() => {
                      setPurposeMode("preset");
                      setPurpose(t);
                    }}
                  />
                  {purposeLabel(t)}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="le-purpose"
                  checked={purposeMode === "custom"}
                  onChange={() => setPurposeMode("custom")}
                />
                직접 입력
              </label>
            </div>
            {purposeMode === "custom" ? (
              <textarea
                value={purposeCustom}
                onChange={(e) => setPurposeCustom(e.target.value)}
                rows={2}
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="설명회 목적 직접 입력"
              />
            ) : null}
          </section>

          <section>
            <span className="mb-2 block text-sm font-semibold">핵심 주제 (복수 선택)</span>
            <div className="flex flex-wrap gap-2">
              {CORE_TOPIC_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleTopic(o.id)}
                  className={
                    coreTopics.includes(o.id)
                      ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold text-slate-800">옵션</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold">설명회 일시</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">센터명</label>
                <input
                  value={centerName}
                  onChange={(e) => setCenterName(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="한우리 ○○센터"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">브랜드 노출</label>
                <select
                  value={brandIntensity}
                  onChange={(e) => setBrandIntensity(e.target.value as BrandIntensity)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="약">약</option>
                  <option value="중">중</option>
                  <option value="강">강</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">톤앤매너</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as ToneStyle)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="안내형">안내형</option>
                  <option value="설득형">설득형</option>
                  <option value="전문형">전문형</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">PPT 목표 장수</label>
                <input
                  type="number"
                  min={10}
                  max={24}
                  value={pageCount}
                  onChange={(e) => setPageCount(Number(e.target.value) || 18)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <section>
            <label className="mb-1 block text-sm font-semibold">
              사용자 업로드 (B등급 · 평가계획 PDF 등)
            </label>
            <input
              type="file"
              multiple
              accept=".pdf,.txt,.md,.png,.jpg,.jpeg"
              onChange={(e) => setAttachFiles(Array.from(e.target.files ?? []))}
              className="text-sm"
            />
            {attachFiles.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">{attachFiles.map((f) => f.name).join(", ")}</p>
            ) : null}
          </section>

          <details className="rounded-lg border bg-slate-50 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-semibold text-slate-700">
              Data Layer 분기 미리보기
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-slate-600">{branchPlan.matrixSummary}</pre>
          </details>

          {err ? <p className="text-sm text-rose-700">{err}</p> : null}
          {status ? <p className="text-sm text-indigo-600">{status}</p> : null}

          <button
            type="button"
            disabled={busy || !subRegion || !purposeReady || coreTopics.length === 0}
            onClick={() => void handleDataLayerStart()}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Data Layer 수집 중…" : "공식 데이터 수집 · 주제 분석 시작"}
          </button>
        </div>
      ) : null}

      {(step === "data" || step === "topic") && data ? (
        <div className="space-y-6">
          <TokenUsagePanel ledger={tokenLedger} highlight="topicSelection" />

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold">Data Layer · 수집 결과</h2>
            <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">{data.branchSummary}</p>
            <OfficialScanResultsPanel scan={data.scan} />
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold">자료집 주제 선택 (수집·목적·핵심주제 반영)</h2>
            <div className="mt-3 space-y-3">
              {topics.map((t) => (
                <label
                  key={t.id}
                  className={`block cursor-pointer rounded-xl border p-4 ${
                    selectedTopicId === t.id ? "border-indigo-500 bg-indigo-50" : ""
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={selectedTopicId === t.id}
                    onChange={() => setSelectedTopicId(t.id)}
                  />
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-slate-900">{t.title}</span>
                    <span className="text-sm font-bold text-indigo-600">{t.totalScore}점</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{t.summary}</p>
                </label>
              ))}
            </div>

            <BriefingStorylinePanel
              brief={storylineBrief}
              loading={storylineLoading}
              targetSlideCount={pageCount}
            />

            <button
              type="button"
              disabled={busy || !selectedTopic}
              onClick={() => void handleWriteManuscript()}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "설명자료 줄글 작성 중…" : "설명자료 줄글 작성 · 검토 화면으로"}
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              선택 주제로 종합 레포트(줄글)를 먼저 확인·수정한 뒤, 승인하면 슬라이드 {pageCount}장
              기획으로 넘어갑니다.
            </p>
          </section>
        </div>
      ) : null}

      {step !== "input" && !data && !busy ? (
        <button
          type="button"
          onClick={() => setStep("input")}
          className="text-sm text-indigo-600"
        >
          ← 조건 입력으로
        </button>
      ) : null}
    </div>
  );
}
