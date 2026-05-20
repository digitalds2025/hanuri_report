import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BriefingSlideDesigner } from "../components/briefing/BriefingSlideDesigner";
import {
  KOREA_REGIONS,
  REGION_NAMES,
  type ParentAudience,
  type SchoolLevel,
} from "../config/koreaRegions";
import { extractTextFromFiles, type FileExtractProgress } from "../lib/briefingFileExtract";
import type {
  BriefingLayoutSlide,
  BriefingMaterialFormInput,
  BriefingMaterialKit,
  BriefingSlidePlan,
} from "../lib/briefingMaterialTypes";
import {
  listBriefingMaterialKits,
  newBriefingKitId,
  saveBriefingMaterialKit,
} from "../lib/briefingMaterialStorage";
import { designBriefingSlideLayouts, planBriefingSlides } from "../lib/geminiBriefingKit";

type WizardPhase = "input" | "plan" | "design";

const SCHOOL_LEVELS: SchoolLevel[] = ["초등", "중등", "고등"];
const PARENT_TYPES: ParentAudience[] = ["신입 모집", "기존 학생"];

export function BriefingMaterialPage() {
  const [phase, setPhase] = useState<WizardPhase>("input");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [referenceText, setReferenceText] = useState("");
  const [requirements, setRequirements] = useState("");
  const [region, setRegion] = useState(REGION_NAMES[0] ?? "서울");
  const [subRegion, setSubRegion] = useState(KOREA_REGIONS[REGION_NAMES[0] ?? "서울"]?.[0] ?? "");
  const [schoolLevels, setSchoolLevels] = useState<SchoolLevel[]>(["초등"]);
  const [parentAudience, setParentAudience] = useState<ParentAudience>("신입 모집");
  const [pageCount, setPageCount] = useState(10);

  const [slidePlans, setSlidePlans] = useState<BriefingSlidePlan[]>([]);
  const [layoutSlides, setLayoutSlides] = useState<BriefingLayoutSlide[]>([]);
  const [savedKits, setSavedKits] = useState<BriefingMaterialKit[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState<string | null>(null);

  const subRegions = useMemo(() => KOREA_REGIONS[region] ?? [], [region]);

  useEffect(() => {
    void refreshSavedList();
  }, []);

  const formInput = useCallback((): BriefingMaterialFormInput => {
    return {
      referenceText,
      requirements,
      region,
      subRegion,
      schoolLevels,
      parentAudience,
      pageCount,
      attachmentNames: files.map((f) => f.name),
    };
  }, [referenceText, requirements, region, subRegion, schoolLevels, parentAudience, pageCount, files]);

  async function refreshSavedList() {
    try {
      const list = await listBriefingMaterialKits();
      setSavedKits(list);
    } catch {
      /* ignore */
    }
  }

  async function mergeFiles(newFiles: FileList | File[]) {
    const arr = [...newFiles];
    if (!arr.length) return;
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...arr.filter((f) => !names.has(f.name))];
    });
    setExtracting(true);
    setExtractStatus(null);
    const onProgress = (p: FileExtractProgress) => {
      const label =
        p.status === "gemini"
          ? "PDF/이미지 텍스트 추출 중…"
          : p.status === "reading"
            ? "텍스트 파일 읽는 중…"
            : p.status === "error"
              ? "일부 추출 실패"
              : "완료";
      setExtractStatus(`${p.fileName}: ${label}`);
    };
    try {
      const { text } = await extractTextFromFiles(arr, onProgress);
      setReferenceText((prev) => (prev ? `${prev}\n\n${text}` : text));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
      setExtractStatus(null);
    }
  }

  function onRegionChange(next: string) {
    setRegion(next);
    const subs = KOREA_REGIONS[next] ?? [];
    setSubRegion(subs[0] ?? "");
  }

  function toggleSchoolLevel(lv: SchoolLevel) {
    setSchoolLevels((prev) => {
      if (prev.includes(lv)) {
        const next = prev.filter((x) => x !== lv);
        return next.length ? next : prev;
      }
      return [...prev, lv];
    });
  }

  async function goToPlanPhase() {
    setErr(null);
    if (!requirements.trim() && !referenceText.trim() && files.length === 0) {
      setErr("첨부 파일, 참고 텍스트, 또는 요청 사항을 입력해 주세요.");
      return;
    }
    if (!subRegion) {
      setErr("세부 지역을 선택해 주세요.");
      return;
    }
    setBusy(true);
    try {
      let ref = referenceText;
      if (files.length) {
        const { text } = await extractTextFromFiles(files);
        ref = [referenceText, text].filter(Boolean).join("\n\n");
        setReferenceText(ref);
      }
      const plans = await planBriefingSlides(ref, formInput());
      setSlidePlans(plans);
      setPhase("plan");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function goToDesignPhase() {
    setErr(null);
    setBusy(true);
    try {
      const slides = await designBriefingSlideLayouts(referenceText, formInput(), slidePlans);
      setLayoutSlides(slides);
      setPhase("design");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!layoutSlides.length) return;
    setSaving(true);
    setSaveMsg(null);
    setErr(null);
    try {
      const title =
        slidePlans[0]?.title?.trim() ||
        `${region} ${subRegion} 설명회 자료집`;
      const kit: BriefingMaterialKit = {
        id: newBriefingKitId(),
        title,
        created_at: new Date().toISOString(),
        reference_text: referenceText,
        meta: {
          region,
          subRegion,
          schoolLevels,
          parentAudience,
          pageCount,
          requirements,
          attachmentNames: files.map((f) => f.name),
        },
        slide_plans: slidePlans,
        slides: layoutSlides,
      };
      await saveBriefingMaterialKit(kit);
      setSaveMsg(`저장되었습니다: 「${title}」`);
      await refreshSavedList();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (phase === "design") {
    return (
      <BriefingSlideDesigner
        slides={layoutSlides}
        onSlidesChange={setLayoutSlides}
        isGenerating={busy}
        error={err}
        onBack={() => setPhase("plan")}
        onSave={() => void handleSave()}
        saving={saving}
        saveMessage={saveMsg}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">자료집 생성</h1>
          <p className="mt-1 text-sm text-slate-600">
            설명회용 PPT 자료집 — 첨부·요청 입력 → 슬라이드 기획 → 레이아웃 디자인 → 저장
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-medium text-indigo-600 hover:underline"
          onClick={() => void refreshSavedList()}
        >
          저장 목록 새로고침
        </button>
      </div>

      <div className="flex gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <span className={phase === "input" ? "text-indigo-600" : ""}>1. 입력</span>
        <span>→</span>
        <span className={phase === "plan" ? "text-indigo-600" : ""}>2. 기획안</span>
        <span>→</span>
        <span>3. 레이아웃</span>
      </div>

      {phase === "input" ? (
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <section>
            <label className="mb-2 block text-sm font-semibold text-slate-800">첨부 파일 (드래그 앤 드롭)</label>
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void mergeFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50 hover:border-indigo-300"
              }`}
            >
              <p className="text-sm text-slate-600">파일을 여기에 놓거나 클릭하여 선택</p>
              <p className="mt-1 text-xs text-slate-400">
                txt·md·csv는 내용 그대로, PDF·jpg·png는 Gemini로 OCR/텍스트 추출 후 아래 칸에 채워집니다.
                (ppt·hwp 등은 자동 추출 안 됨 — 직접 붙여넣기)
              </p>
              {extracting ? (
                <p className="mt-2 text-xs font-medium text-indigo-600">
                  {extractStatus ?? "첨부 파일 분석 중…"}
                </p>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void mergeFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {files.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {files.map((f) => (
                  <li key={f.name} className="flex justify-between gap-2">
                    <span>{f.name}</span>
                    <button
                      type="button"
                      className="text-rose-600 hover:underline"
                      onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
                    >
                      제거
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section>
            <label className="mb-2 block text-sm font-semibold text-slate-800">참고 자료 텍스트 (선택·편집 가능)</label>
            <textarea
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value)}
              rows={6}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              placeholder="첨부 파일 본문이 여기에 쌓입니다. PDF/이미지는 추출에 수십 초 걸릴 수 있습니다."
            />
          </section>

          <section>
            <label className="mb-2 block text-sm font-semibold text-slate-800">요청 사항 (프롬프트)</label>
            <textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              placeholder="설명회 목적, 강조할 프로그램, 톤앤매너 등"
            />
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-800">지역</label>
              <select
                value={region}
                onChange={(e) => onRegionChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {REGION_NAMES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-800">세부 지역</label>
              <select
                value={subRegion}
                onChange={(e) => setSubRegion(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {subRegions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <section>
            <span className="mb-2 block text-sm font-semibold text-slate-800">대상 학년</span>
            <div className="flex flex-wrap gap-3">
              {SCHOOL_LEVELS.map((lv) => (
                <label key={lv} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={schoolLevels.includes(lv)}
                    onChange={() => toggleSchoolLevel(lv)}
                  />
                  {lv}
                </label>
              ))}
            </div>
          </section>

          <section>
            <span className="mb-2 block text-sm font-semibold text-slate-800">참석 학부모 유형</span>
            <div className="flex flex-wrap gap-4">
              {PARENT_TYPES.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="parentAudience"
                    checked={parentAudience === t}
                    onChange={() => setParentAudience(t)}
                  />
                  {t}
                </label>
              ))}
            </div>
          </section>

          <section>
            <label className="mb-2 flex justify-between text-sm font-semibold text-slate-800">
              <span>제작 분량</span>
              <span className="text-indigo-600">{pageCount}장</span>
            </label>
            <input
              type="range"
              min={1}
              max={20}
              value={pageCount}
              onChange={(e) => setPageCount(Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-1 text-xs text-slate-500">최대 20장(슬라이드)</p>
          </section>

          {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p> : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void goToPlanPhase()}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "기획안 생성 중…" : "다음 — 슬라이드 기획안 생성"}
          </button>
        </div>
      ) : null}

      {phase === "plan" ? (
        <div className="space-y-6">
          <p className="text-sm text-slate-600">
            슬라이드별 기획안을 확인·수정한 뒤 다음을 누르면 Gemini가 레이아웃 JSON으로 변환합니다.
          </p>
          {slidePlans.map((plan, idx) => (
            <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                  {plan.slideNumber}
                </span>
                <input
                  value={plan.title}
                  onChange={(e) => {
                    const next = [...slidePlans];
                    next[idx] = { ...plan, title: e.target.value };
                    setSlidePlans(next);
                  }}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold"
                />
              </div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">목적</label>
              <textarea
                value={plan.purpose}
                rows={2}
                onChange={(e) => {
                  const next = [...slidePlans];
                  next[idx] = { ...plan, purpose: e.target.value };
                  setSlidePlans(next);
                }}
                className="mb-3 w-full rounded-lg border border-slate-200 p-2 text-sm"
              />
              <label className="mb-1 block text-xs font-semibold text-slate-500">핵심 포인트 (줄마다 하나)</label>
              <textarea
                value={plan.keyPoints.join("\n")}
                rows={3}
                onChange={(e) => {
                  const next = [...slidePlans];
                  next[idx] = {
                    ...plan,
                    keyPoints: e.target.value.split("\n").filter((l) => l.trim()),
                  };
                  setSlidePlans(next);
                }}
                className="mb-3 w-full rounded-lg border border-slate-200 p-2 text-sm"
              />
              <label className="mb-1 block text-xs font-semibold text-slate-500">발표 노트</label>
              <textarea
                value={plan.speakerNotes}
                rows={3}
                onChange={(e) => {
                  const next = [...slidePlans];
                  next[idx] = { ...plan, speakerNotes: e.target.value };
                  setSlidePlans(next);
                }}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm"
              />
            </div>
          ))}

          {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p> : null}

          <div className="flex gap-3">
            <button
              type="button"
              className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => setPhase("input")}
            >
              이전
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void goToDesignPhase()}
              className="flex-[2] rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "레이아웃 설계 중…" : "다음 — PPT 슬라이드 레이아웃 생성"}
            </button>
          </div>
        </div>
      ) : null}

      {savedKits.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-800">저장된 자료집</h2>
          <ul className="space-y-2 text-sm">
            {savedKits.slice(0, 10).map((k) => (
              <li key={k.id} className="flex justify-between gap-2 text-slate-700">
                <span>{k.title}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {new Date(k.created_at).toLocaleDateString("ko-KR")} · {k.slides.length}장
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-center text-xs text-slate-500">
        <Link to="/students" className="text-indigo-600 hover:underline">
          학생 목록으로
        </Link>
      </p>
    </div>
  );
}
