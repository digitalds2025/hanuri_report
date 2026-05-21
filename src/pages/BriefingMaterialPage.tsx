import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  KOREA_REGIONS,
  REGION_NAMES,
  type ParentAudience,
  type SchoolLevel,
} from "../config/koreaRegions";
import { OfficialScanResultsPanel } from "../components/briefing/OfficialScanResultsPanel";
import { SlideRenderer } from "../components/briefing/SlideRenderer";
import { extractTextFromFiles } from "../lib/briefingFileExtract";
import type { BriefingTopicCandidate, GuardrailIssue } from "../lib/briefingMaterialTypes";
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
  runLocalEduGeneration,
  runLocalEduTopicRecommend,
  type CoreTopicId,
  type LocalEduGenerationOutput,
  type LocalEduInput,
  type LocalEduDataLayerResult,
} from "../lib/localEdu";
import { getDataCollectionPlan } from "../lib/localEdu/dataMatrix";
import type { TargetGrade } from "../lib/briefingMaterialTypes";
import type { BrandIntensity, ToneStyle } from "../lib/localEdu/types";

type WizardStep = "input" | "data" | "topic" | "outline" | "output";

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

function GuardrailList({ issues }: { issues: GuardrailIssue[] }) {
  if (!issues.length) return <p className="text-sm text-emerald-700">가드레일 통과</p>;
  return (
    <ul className="space-y-2 text-sm">
      {issues.map((i, idx) => (
        <li
          key={`${i.code}-${idx}`}
          className={
            i.severity === "error"
              ? "text-rose-700"
              : i.severity === "warning"
                ? "text-amber-800"
                : "text-slate-600"
          }
        >
          <strong>[{i.severity}]</strong> {i.message}
          {i.suggestion ? <span className="block text-xs opacity-80">{i.suggestion}</span> : null}
        </li>
      ))}
    </ul>
  );
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
  const [attachmentText, setAttachmentText] = useState("");
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [previewSlide, setPreviewSlide] = useState(0);

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

      setStatus("Design Layer · 주제 추천·5대 점수");
      const t = await runLocalEduTopicRecommend(dataPlan, result, attachText);
      setTopics(t);
      setSelectedTopicId(t[0]?.id ?? null);
      setStep("data");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function handleGenerate() {
    if (!data || !selectedTopic) return;
    setErr(null);
    setBusy(true);
    try {
      const gen = await runLocalEduGeneration(
        dataPlan,
        data,
        selectedTopic,
        attachmentText,
        attachmentNames,
        (p) => setStatus(`${p.layer}: ${p.message}`),
      );
      setGeneration(gen);
      setStep("output");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  const downloadAll = useCallback(async () => {
    if (!generation) return;
    const safeName = `${subRegion}_${targetGrade}_LocalEdu`.replace(/\s+/g, "_");
    const payload = layoutSlidesToPptxPayload(
      generation.slides,
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
  }, [generation, data, subRegion, targetGrade]);

  const stepLabels: Record<WizardStep, string> = {
    input: "1. 조건",
    data: "2. 데이터",
    topic: "3. 주제",
    outline: "4. 아웃라인",
    output: "5. 출력",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">로컬에듀 마스터</h1>
        <p className="mt-1 text-sm text-slate-600">
          LocalEdu Master — 지역 맞춤 설명회·상담 자료 반자동 생성
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Input → Data(RAG) → Design(마스터 아웃라인) → Generation(PPT/DOCX) → Guardrail
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

      {(step === "data" || step === "topic" || step === "outline" || step === "output") && data ? (
        <div className="space-y-6">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold">Data Layer · 수집 결과</h2>
            <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">{data.branchSummary}</p>
            <OfficialScanResultsPanel scan={data.scan} />
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold">Design Layer · 주제 선택 (5대 점수)</h2>
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
            <button
              type="button"
              disabled={busy || !selectedTopic}
              onClick={() => {
                setStep("outline");
                void handleGenerate();
              }}
              className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "Generation Layer…" : "마스터 아웃라인 → PPT/DOCX 생성"}
            </button>
          </section>

          {generation ? (
            <>
              <section className="rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold">Guardrail Layer</h2>
                <p className="mt-1 text-xs">
                  {generation.guardrail.passed ? "✅ 검수 통과" : "⚠️ 수정 권장"}
                </p>
                <GuardrailList issues={generation.guardrail.issues} />
              </section>

              <section className="rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold">마스터 아웃라인</h2>
                <p className="text-xs text-slate-500">
                  기준 시점: {generation.dataAsOf} · {generation.outline.regionLabel}
                </p>
                <ul className="mt-3 max-h-48 space-y-2 overflow-auto text-xs">
                  {generation.outline.blocks.map((b) => (
                    <li key={b.blockId} className="rounded-lg bg-slate-50 p-2">
                      <strong>{b.title}</strong>
                      <ul className="mt-1 list-inside list-disc text-slate-600">
                        {b.bulletPoints.slice(0, 4).map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                      {b.instructorInsightSlots?.length ? (
                        <p className="mt-1 text-amber-800">
                          💡 {b.instructorInsightSlots.join(" · ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">PPT 미리보기</h2>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      disabled={previewSlide <= 0}
                      onClick={() => setPreviewSlide((n) => n - 1)}
                    >
                      이전
                    </button>
                    <span>
                      {previewSlide + 1} / {generation.slides.length}
                    </span>
                    <button
                      type="button"
                      disabled={previewSlide >= generation.slides.length - 1}
                      onClick={() => setPreviewSlide((n) => n + 1)}
                    >
                      다음
                    </button>
                  </div>
                </div>
                <div className="mt-4 aspect-video max-h-[420px] w-full">
                  <SlideRenderer slide={generation.slides[previewSlide]} />
                </div>
              </section>

              <button
                type="button"
                onClick={() => void downloadAll()}
                className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white"
              >
                PPTX · DOCX · 상담키트 · 리서치 원본 다운로드
              </button>
            </>
          ) : null}
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
