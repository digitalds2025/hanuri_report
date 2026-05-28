import { type FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { GrowthMomentForm } from "../components/monthly/GrowthMomentForm";
import {
  HanuriBookSearchPanel,
  searchHitToMockBook,
  type BookSearchHit,
} from "../components/books/HanuriBookSearchPanel";
import { MonthlyReportResultView } from "../components/monthly/MonthlyReportResultView";
import {
  generateMonthlyReportBundle,
  type MonthlyReportAITokenUsage,
} from "../lib/geminiMonthlyBundle";
import { compressImageToDataUrl } from "../lib/imageCompress";
import { competencyAnalysisToMReportComments } from "../lib/competencyAnalysisSplit";
import type { MockBook } from "../lib/mockBooks";
import { useMonthlyReports } from "../hooks/useMonthlyReports";
import { useStudents } from "../hooks/useStudents";
import {
  buildMonthlyGrowthMetaJson,
  growthMetaFromJson,
  readMonthlyGrowthMetaExtras,
  type GrowthMetaState,
} from "../lib/monthlyGrowthMeta";
import { bookKeywordsToDisplayItems, reportHeaderTitle } from "../lib/monthlyReportDisplay";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { uploadWritingImageForStudent } from "../lib/writingImageStorage";
import {
  fetchBookById,
  refreshMockBookAiFromDb,
  refreshMockBooksAiFromDb,
} from "../lib/fetchBookByTitle";
import type { MonthlyReportBookContext } from "../lib/geminiMonthlyBundle";
import { localSaveMonthlyReport } from "../lib/localStoreApi";
import { pickStrengthWeaknessPointsForReport } from "../lib/pillarStrengthWeakness";
import { stripAiPlainText } from "../lib/reportPlainText";
import {
  buildReportPrivacyContext,
  sanitizeReportStudentPii,
} from "../lib/reportStudentPrivacy";
import type { Json, MonthlyReport } from "../lib/types/database";
import { parsePillarScores, type PillarKey, pillarLabelsKo } from "../lib/reportAggregates";

const KEYS: PillarKey[] = ["reading", "thinking", "discussion", "writing", "growth"];

const MAX_WRITING_IMAGES = 2;
const MAX_SELECTED_BOOKS = 2;

const WIZARD_STEPS = [
  { id: 1, title: "이달의 성장 모먼트" },
  { id: 2, title: "이달의 글쓰기" },
  { id: 3, title: "이달의 도서" },
  { id: 4, title: "5대 역량" },
  { id: 5, title: "따뜻한 한마디 · 생성" },
  { id: 6, title: "결과 확인 · 저장" },
] as const;

function currentYearMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** 쿼리 `ym` / 초기 표시용 — `YYYY-MM`만 허용 */
function parseYearMonthQuery(raw: string | null): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  return s;
}

/** `?step=6` — 저장된 월간 리포트를 「결과 확인 · 저장」단계에서 열 때 */
function parseResultStepQuery(raw: string | null): boolean {
  if (raw == null) return false;
  const n = Number.parseInt(raw.trim(), 10);
  return n === 6;
}

function emptyPillarComments(): Record<PillarKey, string> {
  return {
    reading: "",
    thinking: "",
    discussion: "",
    writing: "",
    growth: "",
  };
}

/** 선택/토글 비교용 — `id` 누락·중복 시에도 서로 다른 책으로 구분 */
function bookSelectionKey(b: MockBook): string {
  const db = b.db_book_id != null ? String(b.db_book_id).trim() : "";
  if (db) return `db:${db}`;
  const sid = typeof b.id === "string" ? b.id.trim() : "";
  if (sid) return `id:${sid}`;
  return `tp:${b.title}|${b.publisher}|${b.author}`;
}

/** `m_reports.book_keywords` + (선택) `growth_meta`의 도서 메타 → 마법사 `selectedBooks` 복원 */
function mockBooksFromSavedBookKeywords(
  rep: MonthlyReport,
  growthSelected: { title: string; author: string; publisher: string } | null,
): MockBook[] {
  const raw = rep.book_keywords;
  const dbIds: (string | undefined)[] = [
    rep.book_id?.trim() || undefined,
    rep.book_id2?.trim() || undefined,
  ];

  if (Array.isArray(raw) && raw.length > 0) {
    const out: MockBook[] = [];
    for (let i = 0; i < raw.length && i < MAX_SELECTED_BOOKS; i++) {
      const e = raw[i];
      if (typeof e !== "object" || e === null || Array.isArray(e)) continue;
      const o = e as Record<string, unknown>;
      const kw = Array.isArray(o.ai_keywords)
        ? o.ai_keywords
            .filter((x): x is string => typeof x === "string")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const titleFromJson =
        typeof o.title === "string" && o.title.trim() ? o.title.trim() : kw[0] ?? `도서 ${i + 1}`;
      const author = typeof o.author === "string" ? o.author.trim() : "";
      const publisher = typeof o.publisher === "string" ? o.publisher.trim() : "";
      const ai_cat =
        typeof o.ai_category === "string" && o.ai_category.trim() ? o.ai_category.trim() : null;
      const cover =
        typeof o.cover_url === "string" && o.cover_url.trim() ? o.cover_url.trim() : undefined;
      out.push({
        id: `saved-${rep.id}-bk-${i}`,
        db_book_id: dbIds[i],
        title: titleFromJson,
        author,
        publisher,
        cover_url: cover,
        ai_category: ai_cat,
        ai_keywords: kw.length ? kw : undefined,
      });
    }
    if (out.length > 0) {
      if (growthSelected?.title.trim()) {
        const fb = growthSelected;
        out[0] = {
          ...out[0]!,
          title: fb.title.trim() || out[0]!.title,
          author: out[0]!.author || (typeof fb.author === "string" ? fb.author.trim() : ""),
          publisher: out[0]!.publisher || (typeof fb.publisher === "string" ? fb.publisher.trim() : ""),
        };
      }
      return out;
    }
  }

  if (growthSelected?.title.trim()) {
    const fb = growthSelected;
    return [
      {
        id: `saved-${rep.id}`,
        title: fb.title.trim(),
        author: typeof fb.author === "string" ? fb.author.trim() : "",
        publisher: typeof fb.publisher === "string" ? fb.publisher.trim() : "",
        db_book_id: rep.book_id?.trim() || undefined,
      },
    ];
  }

  return [];
}

export function MonthlyReportNewPage() {
  const { id: studentId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [yearMonth, setYearMonth] = useState(() => {
    const fromUrl = parseYearMonthQuery(new URLSearchParams(window.location.search).get("ym"));
    return fromUrl ?? currentYearMonth();
  });
  const [wizardStep, setWizardStep] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return parseResultStepQuery(sp.get("step")) ? 6 : 1;
  });

  const { reports: savedMonthlyReports, loading: savedMonthlyLoading } = useMonthlyReports(studentId);
  const { students } = useStudents();
  const reportPrivacy = useMemo(
    () =>
      buildReportPrivacyContext({
        studentNick: students.find((s) => s.student_id === studentId)?.student_nick,
        studentId,
      }),
    [students, studentId],
  );
  const hydratedSavedKeyRef = useRef<string | null>(null);
  const booksAiRefreshKeyRef = useRef<string>("");

  const searchKey = searchParams.toString();
  useEffect(() => {
    const fromUrl = parseYearMonthQuery(searchParams.get("ym"));
    setYearMonth(fromUrl ?? currentYearMonth());
  }, [studentId, searchKey]);

  const [growthMeta, setGrowthMeta] = useState<GrowthMetaState>({
    step1: [],
    step2: [],
    step3: "",
  });

  const [writingImages, setWritingImages] = useState<string[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageErr, setImageErr] = useState<string | null>(null);
  const [imageDragActive, setImageDragActive] = useState(false);
  const imageDragDepth = useRef(0);
  const writingFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedBooks, setSelectedBooks] = useState<MockBook[]>([]);
  const selectedBooksRef = useRef<MockBook[]>([]);
  selectedBooksRef.current = selectedBooks;

  const [scores, setScores] = useState<Record<PillarKey, number>>(
    () => Object.fromEntries(KEYS.map((k) => [k, 5])) as Record<PillarKey, number>,
  );
  const [pillarComments, setPillarComments] = useState<Record<PillarKey, string>>(emptyPillarComments);

  const [warmDraft, setWarmDraft] = useState("");

  const [growth, setGrowth] = useState("");
  const [competencyAnalysis, setCompetencyAnalysis] = useState("");
  const [teacherNote, setTeacherNote] = useState("");

  const [aiBusy, setAiBusy] = useState(false);
  const [aiTokenUsage, setAiTokenUsage] = useState<MonthlyReportAITokenUsage | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /** `?step=6` + 해당 `ym` 저장분 → 6단계 폼에 채움 (훅 순서: 모든 해당 `useState` 뒤) */
  useLayoutEffect(() => {
    if (!studentId) return;
    if (!parseResultStepQuery(searchParams.get("step"))) {
      hydratedSavedKeyRef.current = null;
      return;
    }

    if (savedMonthlyLoading) {
      setWizardStep(6);
      return;
    }

    const rep = savedMonthlyReports.find((x) => x.year_month === yearMonth);
    if (!rep) {
      hydratedSavedKeyRef.current = null;
      setWizardStep(1);
      setMsg("이 달에 저장된 레포트가 없습니다.");
      return;
    }

    const mark = `${studentId}|${yearMonth}|${rep.id}`;
    if (hydratedSavedKeyRef.current === mark) return;
    hydratedSavedKeyRef.current = mark;

    const gm = growthMetaFromJson(rep.growth_meta);
    const ex = readMonthlyGrowthMetaExtras(rep.growth_meta);

    setGrowthMeta(gm);
    setGrowth(rep.growth_moments ?? "");
    setTeacherNote(rep.teacher_note ?? "");
    setWarmDraft(ex.warm_message_draft ?? "");
    setCompetencyAnalysis(ex.competency_analysis_ai ?? "");

    const merged = emptyPillarComments();
    const fromPc = ex.pillar_comments as Partial<Record<PillarKey, string>> | undefined;
    if (fromPc) {
      for (const k of KEYS) {
        const v = fromPc[k];
        if (typeof v === "string" && v.trim()) merged[k] = v.trim();
      }
    }
    setPillarComments(merged);

    const parsed = parsePillarScores(rep.competency_ratings);
    setScores(
      Object.fromEntries(
        KEYS.map((k) => [k, typeof parsed[k] === "number" ? (parsed[k] as number) : 5]),
      ) as Record<PillarKey, number>,
    );

    const urls: string[] = [];
    for (const u of ex.writing_images ?? []) {
      if (typeof u === "string" && u.trim()) urls.push(u.trim());
    }
    const wurl = rep.writing_image_url?.trim();
    if (wurl && !urls.includes(wurl)) urls.unshift(wurl);
    setWritingImages(urls.slice(0, MAX_WRITING_IMAGES));

    const sb = ex.selected_book;
    const fb =
      sb && typeof sb.title === "string" && sb.title.trim()
        ? {
            title: sb.title.trim(),
            author: typeof sb.author === "string" ? sb.author.trim() : "",
            publisher: typeof sb.publisher === "string" ? sb.publisher.trim() : "",
          }
        : null;
    const restored = mockBooksFromSavedBookKeywords(rep, fb);
    setSelectedBooks(restored);
    if (restored.some((b) => b.db_book_id?.trim())) {
      void refreshMockBooksAiFromDb(restored)
        .then((refreshed) => setSelectedBooks(refreshed))
        .catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
    }

    setWizardStep(6);
    setAiTokenUsage(null);
    setMsg(null);
  }, [studentId, yearMonth, savedMonthlyReports, savedMonthlyLoading, searchParams]);

  /** 3단 이후 — books 테이블에서 ai_category·ai_keywords 동기화(비어 있으면 Gemini 보완) */
  useEffect(() => {
    if (wizardStep < 3 || selectedBooks.length === 0) return;
    const key = selectedBooks
      .map((b) => `${b.db_book_id?.trim() ?? ""}|${bookSelectionKey(b)}`)
      .join(";");
    if (!selectedBooks.some((b) => b.db_book_id?.trim())) return;
    if (booksAiRefreshKeyRef.current === key) return;
    booksAiRefreshKeyRef.current = key;
    let cancelled = false;
    void refreshMockBooksAiFromDb(selectedBooks).then((refreshed) => {
      if (!cancelled) setSelectedBooks(refreshed);
    });
    return () => {
      cancelled = true;
    };
  }, [wizardStep, selectedBooks]);

  function isBookSearchHitSelected(hit: BookSearchHit) {
    return selectedBooks.some((s) => bookSelectionKey(s) === hit.key);
  }

  async function toggleResultBookSelection(b: MockBook) {
    const key = bookSelectionKey(b);

    const prev = selectedBooksRef.current;
    const idx = prev.findIndex((x) => bookSelectionKey(x) === key);
    if (idx >= 0) {
      setSelectedBooks(prev.filter((_, i) => i !== idx));
      return;
    }
    if (prev.length >= MAX_SELECTED_BOOKS) return;

    let toAdd = b;
    if (b.db_book_id?.trim()) {
      try {
        toAdd = await refreshMockBookAiFromDb(b);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
        return;
      }
    }

    setSelectedBooks((p) => {
      if (p.some((x) => bookSelectionKey(x) === key)) return p;
      if (p.length >= MAX_SELECTED_BOOKS) return p;
      return [...p, toAdd];
    });
  }

  function removeSelectedBookAt(index: number) {
    setSelectedBooks((prev) => prev.filter((_, i) => i !== index));
  }

  const growthMetaPayload: Json = useMemo(
    () =>
      buildMonthlyGrowthMetaJson(growthMeta, {
        pillar_comments: pillarComments,
        selected_book:
          selectedBooks[0] != null
            ? {
                title: selectedBooks[0].title,
                author: selectedBooks[0].author,
                publisher: selectedBooks[0].publisher,
              }
            : null,
        warm_message_draft: warmDraft,
        writing_images: writingImages.slice(0, MAX_WRITING_IMAGES),
        competency_analysis_ai: competencyAnalysis.trim() || null,
      }),
    [growthMeta, pillarComments, selectedBooks, warmDraft, writingImages, competencyAnalysis],
  );

  /**
   * 월간 리포트 저장·6단계 표시용 — `books`와 동일: 칩은 ai_category·ai_keywords, 표지는 cover_url.
   * 최대 2권이면 JSON 배열로 저장.
   */
  const bookKeywordsPayload: Json = useMemo(() => {
    if (selectedBooks.length === 0) {
      return { source: "none", note: "도서 미선택" } as unknown as Json;
    }
    const arr = selectedBooks.map((b) => ({
      ai_category: b.ai_category ?? null,
      ai_keywords: b.ai_keywords ?? [],
      cover_url: b.cover_url?.trim() || null,
    }));
    return arr as unknown as Json;
  }, [selectedBooks]);

  const writingDisplayUrls = useMemo(() => writingImages.slice(0, MAX_WRITING_IMAGES), [writingImages]);

  const radarData100 = useMemo(
    () =>
      KEYS.map((k) => ({
        subject: pillarLabelsKo[k],
        score: scores[k] * 10,
      })),
    [scores],
  );

  const bookDisplayItems = useMemo(() => {
    if (selectedBooks.length === 0) return [];
    return selectedBooks.flatMap((b) =>
      bookKeywordsToDisplayItems(
        {
          ai_category: b.ai_category ?? null,
          ai_keywords: b.ai_keywords ?? [],
          cover_url: b.cover_url?.trim() || null,
        } as unknown as Json,
        b.title,
      ),
    );
  }, [selectedBooks]);

  const writingImageNote = useMemo(() => {
    if (!writingImages.length) return "글쓰기 이미지 없음.";
    const http = writingImages.filter((u) => /^https?:\/\//i.test(u)).length;
    const embedded = writingImages.length - http;
    const parts: string[] = [];
    if (http) parts.push(`URL ${http}장`);
    if (embedded) parts.push(`첨부(압축) ${embedded}장`);
    return `이달의 글쓰기 이미지 ${writingImages.length}장 (${parts.join(", ")})`;
  }, [writingImages]);

  /** 이 달에 저장분이 있으면 다시보기처럼 단계 탭으로 바로 이동 가능 */
  const savedReportForYm = useMemo(
    () => savedMonthlyReports.find((x) => x.year_month === yearMonth) ?? null,
    [savedMonthlyReports, yearMonth],
  );
  const canJumpWizardSteps = Boolean(savedReportForYm);

  const canGoNextFrom1 = growthMeta.step1.length > 0 && growthMeta.step2.length > 0;
  const canGoNextFrom2 = writingImages.length > 0;
  const canGoNextFrom3 = selectedBooks.length > 0;
  const canGoNextFrom4 = KEYS.every((k) => pillarComments[k]?.trim());
  const canGenerateFrom5 = warmDraft.trim().length > 0 && canGoNextFrom1 && canGoNextFrom2 && canGoNextFrom3 && canGoNextFrom4;

  const onPickFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const imageFiles = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      if (!imageFiles.length) {
        setImageErr("이미지 파일만 올려 주세요.");
        return;
      }

      const slot = MAX_WRITING_IMAGES - writingImages.length;
      if (slot <= 0) {
        setImageErr(`이미지는 최대 ${MAX_WRITING_IMAGES}장까지 올릴 수 있습니다.`);
        return;
      }

      const toProcess = imageFiles.slice(0, slot);
      if (imageFiles.length > slot) {
        setImageErr(`최대 ${MAX_WRITING_IMAGES}장까지 가능합니다. 앞의 ${slot}장만 추가했습니다.`);
      } else {
        setImageErr(null);
      }

      setImageBusy(true);
      try {
        const urls: string[] = [];
        if (isSupabaseConfigured() && supabase) {
          if (!studentId) {
            setImageErr("이미지를 올리려면 학생을 지정한 화면에서 진행해 주세요.");
            return;
          }
          for (const file of toProcess) {
            urls.push(await uploadWritingImageForStudent(supabase, studentId, file));
          }
        } else {
          for (const file of toProcess) {
            urls.push(await compressImageToDataUrl(file, { maxWidth: 720, quality: 0.7 }));
          }
        }
        setWritingImages((prev) => [...prev, ...urls].slice(0, MAX_WRITING_IMAGES));
      } catch (e) {
        setImageErr(e instanceof Error ? e.message : String(e));
      } finally {
        setImageBusy(false);
      }
    },
    [writingImages, studentId],
  );

  function removeWritingImage(index: number) {
    setWritingImages((prev) => prev.filter((_, i) => i !== index));
    setImageErr(null);
  }

  async function bookContextForAi(primary: MockBook): Promise<MonthlyReportBookContext> {
    const bid = primary.db_book_id?.trim();
    if (bid) {
      const row = await fetchBookById(bid);
      if (row) {
        return {
          title: row.title,
          author: row.author,
          publisher: row.publisher,
          introduce: row.introduce,
          author_cmt: row.author_cmt,
          pub_cmt: row.pub_cmt,
        };
      }
    }
    return {
      title: primary.title,
      author: primary.author,
      publisher: primary.publisher,
      introduce: primary.introduce ?? null,
      author_cmt: primary.author_cmt ?? null,
      pub_cmt: primary.pub_cmt ?? null,
    };
  }

  async function runReportGeneration() {
    const primary = selectedBooks[0];
    if (!primary) return;
    setMsg(null);
    setAiBusy(true);
    try {
      const book = await bookContextForAi(primary);
      const bundle = await generateMonthlyReportBundle(
        {
          growthMeta,
          writingImageNote,
          book,
          scores,
          pillarComments,
          warmMessageDraft: warmDraft,
        },
        reportPrivacy,
      );
      setGrowth(bundle.growthMoment);
      setCompetencyAnalysis(bundle.competencyAnalysis);
      setTeacherNote(bundle.warmMessage);
      setAiTokenUsage(bundle.tokenUsage);
      setWizardStep(6);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  function goNext() {
    setMsg(null);
    setWizardStep((s) => Math.min(6, s + 1));
  }

  function goPrev() {
    setMsg(null);
    setWizardStep((s) => Math.max(1, s - 1));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!studentId) {
      setMsg("학생 ID가 없습니다.");
      return;
    }
    if (!growth.trim()) {
      setMsg("성장 모멘트 본문이 비어 있습니다. 6단계에서 리포트 생성을 다시 실행하거나 직접 입력해 주세요.");
      return;
    }

    setSaving(true);
    setMsg(null);

    const sw = pickStrengthWeaknessPointsForReport(scores, pillarComments);
    const cw = competencyAnalysisToMReportComments(competencyAnalysis);
    const safeGrowth = sanitizeReportStudentPii(stripAiPlainText(growth), reportPrivacy);
    const safeCw = {
      strength_cmt: sanitizeReportStudentPii(cw.strength_cmt ?? "", reportPrivacy),
      weakness_cmt: sanitizeReportStudentPii(cw.weakness_cmt ?? "", reportPrivacy),
    };
    const safeTeacher = sanitizeReportStudentPii(teacherNote.trim(), reportPrivacy) || null;
    const imgSlots = writingImages.slice(0, MAX_WRITING_IMAGES).map((u) => u.trim()).filter(Boolean);

    try {
      if (isSupabaseConfigured()) {
        if (!supabase) {
          setMsg("데이터 저장 연결이 설정되지 않았습니다.");
          return;
        }

        const targetMonth = `${yearMonth}-01`;

        const mRow = {
          score_reading: scores.reading,
          score_thinking: scores.thinking,
          score_discussion: scores.discussion,
          score_writing: scores.writing,
          score_growth: scores.growth,
          growth_moment: safeGrowth || null,
          growth_meta: growthMetaPayload,
          writing_img_url1: imgSlots[0] ?? null,
          writing_img_url2: imgSlots[1] ?? null,
          book_id1: selectedBooks[0]?.db_book_id ?? null,
          book_id2: selectedBooks[1]?.db_book_id ?? null,
          strength_point: sw.strength_point,
          weakness_point: sw.weakness_point,
          strength_cmt: safeCw.strength_cmt,
          weakness_cmt: safeCw.weakness_cmt,
          book_keywords: bookKeywordsPayload,
          teacher_comment: safeTeacher,
        };

        const { data: existingM, error: exErr } = await supabase
          .from("m_reports")
          .select("m_report_id")
          .eq("student_id", studentId)
          .eq("target_month", targetMonth)
          .maybeSingle();

        if (exErr) {
          setMsg(exErr.message);
          return;
        }

        if (existingM?.m_report_id) {
          const { error: upErr } = await supabase.from("m_reports").update(mRow).eq("m_report_id", existingM.m_report_id);
          if (upErr) {
            setMsg(upErr.message);
            return;
          }
        } else {
          const { data: rep, error: repErr } = await supabase
            .from("report")
            .insert({ student_id: studentId })
            .select("report_id")
            .single();
          if (repErr || !rep) {
            setMsg(repErr?.message ?? "report 행 생성 실패");
            return;
          }

          const { error: mErr } = await supabase.from("m_reports").insert({
            report_id: rep.report_id,
            student_id: studentId,
            target_month: targetMonth,
            ...mRow,
          });

          if (mErr) {
            setMsg(mErr.message);
            return;
          }

          const { data: st, error: stErr } = await supabase
            .from("students")
            .select("total_reports_written")
            .eq("student_id", studentId)
            .single();
          if (!stErr && st) {
            await supabase
              .from("students")
              .update({ total_reports_written: st.total_reports_written + 1 })
              .eq("student_id", studentId);
          }
        }

        setMsg("저장되었습니다. 학생 상세로 돌아가 확인해 주세요.");
        return;
      }

      if (!import.meta.env.DEV) {
        setMsg("이 환경에서는 해당 저장 방식을 사용할 수 없습니다.");
        return;
      }

      await localSaveMonthlyReport({
        student_id: studentId,
        year_month: yearMonth,
        growth_moment: safeGrowth || null,
        growth_meta: growthMetaPayload,
        score_reading: scores.reading,
        score_thinking: scores.thinking,
        score_discussion: scores.discussion,
        score_writing: scores.writing,
        score_growth: scores.growth,
        teacher_comment: safeTeacher,
        writing_img_url1: imgSlots[0] ?? null,
        writing_img_url2: imgSlots[1] ?? null,
        book_id1: selectedBooks[0]?.db_book_id ?? null,
        book_id2: selectedBooks[1]?.db_book_id ?? null,
        strength_point: sw.strength_point,
        weakness_point: sw.weakness_point,
        strength_cmt: safeCw.strength_cmt,
        weakness_cmt: safeCw.weakness_cmt,
        book_keywords: bookKeywordsPayload,
      });
      setMsg("저장되었습니다. 학생 상세로 돌아가 확인해 주세요.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!studentId) return <p className="text-sm text-red-600">학생이 지정되지 않았습니다.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
          ← 학생 상세
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">월간 리포트 작성</h1>
        <p className="mt-1 text-sm text-slate-600">
          단계별로 입력한 뒤 마지막에 <strong>리포트 생성하기</strong>로 AI가 성장 모멘트·역량 분석·한마디를 한꺼번에 작성합니다.
        </p>
      </div>

      <nav aria-label="작성 단계" className="flex flex-wrap gap-1.5">
        {WIZARD_STEPS.map((s) => {
          const active = wizardStep === s.id;
          const done = wizardStep > s.id;
          const pill =
            active
              ? "rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white"
              : done
                ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900"
                : "rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600";
          return (
            <button
              key={s.id}
              type="button"
              disabled={!canJumpWizardSteps}
              aria-current={active ? "step" : undefined}
              title={
                canJumpWizardSteps
                  ? `${s.id}단계로 이동`
                  : "이 달에 저장된 레포트가 있으면 탭을 눌러 단계로 바로 이동할 수 있습니다."
              }
              onClick={() => {
                if (!canJumpWizardSteps) return;
                setMsg(null);
                setWizardStep(s.id);
              }}
              className={
                pill +
                " border-0 font-inherit leading-none transition-opacity " +
                (canJumpWizardSteps
                  ? "cursor-pointer hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  : "cursor-default disabled:opacity-90")
              }
            >
              {s.id}. {s.title}
            </button>
          );
        })}
      </nav>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm">
          <span className="text-slate-600">대상 월 (YYYY-MM)</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            pattern="\d{4}-\d{2}"
            required
          />
        </label>

        {wizardStep === 1 ? (
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-800">1. 이달의 성장 모먼트 입력</legend>
            <GrowthMomentForm
              meta={growthMeta}
              onMetaChange={setGrowthMeta}
              growthText=""
              onGrowthTextChange={() => {}}
              inputsOnly
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={!canGoNextFrom1}
                onClick={goNext}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                다음
              </button>
            </div>
            {!canGoNextFrom1 ? (
              <p className="text-xs text-amber-700">1단·2단을 각각 한 가지 이상 선택하거나 추가해 주세요.</p>
            ) : null}
          </fieldset>
        ) : null}

        {wizardStep === 2 ? (
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-800">2. 이달의 글쓰기 (이미지)</legend>
            <p className="text-xs text-slate-600">
              이미지는 <strong>최대 {MAX_WRITING_IMAGES}장</strong>까지 올릴 수 있습니다. 
              </p>
            <input
              ref={writingFileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              disabled={imageBusy || writingImages.length >= MAX_WRITING_IMAGES}
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              aria-label="글쓰기 이미지 드래그 앤 드롭 또는 클릭하여 업로드"
              aria-busy={imageBusy}
              disabled={imageBusy || writingImages.length >= MAX_WRITING_IMAGES}
              onClick={() => writingFileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (writingImages.length >= MAX_WRITING_IMAGES) return;
                imageDragDepth.current += 1;
                setImageDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                imageDragDepth.current -= 1;
                if (imageDragDepth.current <= 0) {
                  imageDragDepth.current = 0;
                  setImageDragActive(false);
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                imageDragDepth.current = 0;
                setImageDragActive(false);
                void onPickFiles(e.dataTransfer.files);
              }}
              className={
                "flex min-h-[11rem] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 " +
                (writingImages.length >= MAX_WRITING_IMAGES
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                  : imageBusy
                    ? "cursor-wait border-slate-300 bg-slate-50/80 text-slate-600"
                    : "cursor-pointer border-slate-300 bg-slate-50/80 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/40 " +
                      (imageDragActive ? "border-indigo-500 bg-indigo-50 text-indigo-900" : ""))
              }
            >
              {imageBusy ? (
                <span className="text-sm font-medium text-slate-600">이미지 처리 중…</span>
              ) : writingImages.length >= MAX_WRITING_IMAGES ? (
                <>
                  <span className="text-sm font-medium text-slate-700">최대 {MAX_WRITING_IMAGES}장까지 업로드되었습니다.</span>
                  <span className="text-xs text-slate-500">아래에서 개별 제거 후 다시 추가할 수 있습니다.</span>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-slate-800">여기로 이미지를 드래그 앤 드롭</span>
                  <span className="text-xs text-slate-500">
                    또는 클릭해서 파일 선택 · 여러 장 선택 시 남은 칸만큼만 추가됩니다.
                  </span>
                </>
              )}
            </button>
            {imageErr ? <p className="text-sm text-red-600">{imageErr}</p> : null}

            

            {writingImages.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700">
                  첨부 미리보기 ({writingImages.length}/{MAX_WRITING_IMAGES})
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {writingImages.map((src, index) => (
                    <div key={`w-${index}-${src.slice(0, 48)}`} className="rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                      <img
                        src={src}
                        alt={`글쓰기 ${index + 1}`}
                        className="mx-auto max-h-44 w-full object-contain"
                      />
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-red-600 underline hover:text-red-700"
                        onClick={() => removeWritingImage(index)}
                      >
                        이 이미지 제거
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-between gap-2 pt-2">
              <button type="button" onClick={goPrev} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                이전
              </button>
              <button
                type="button"
                disabled={!canGoNextFrom2}
                onClick={goNext}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                다음
              </button>
            </div>
            {!canGoNextFrom2 ? (
              <p className="text-xs text-amber-700">
                이미지를 최소 1장 추가해 주세요. (파일, 최대 {MAX_WRITING_IMAGES}장)
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {wizardStep === 3 ? (
          <fieldset className="space-y-4 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-800">3. 이달의 도서</legend>
            

            <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
              <div className="min-w-0 flex-1">
                <HanuriBookSearchPanel
                  onResultClick={(hit) => void toggleResultBookSelection(searchHitToMockBook(hit))}
                  isResultSelected={isBookSearchHitSelected}
                  isResultClickDisabled={(hit) =>
                    selectedBooks.length >= MAX_SELECTED_BOOKS && !isBookSearchHitSelected(hit)
                  }
                  resultClickDisabledTitle={`최대 ${MAX_SELECTED_BOOKS}권까지 선택할 수 있습니다.`}
                />
              </div>

              <aside className="flex w-full shrink-0 flex-col border-t border-slate-200 pt-4 lg:w-[11.5rem] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 xl:w-[13rem]">
                <p className="text-xs font-semibold text-indigo-900">
                  선택된 도서 ({selectedBooks.length}/{MAX_SELECTED_BOOKS})
                </p>
                <div className="mt-3 flex flex-col gap-5">
                  {selectedBooks.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 px-2 py-3 text-center text-[11px] leading-snug text-slate-600">
                      왼쪽 검색 결과에서 책을 눌러 추가하세요.
                    </p>
                  ) : (
                    selectedBooks.map((b, i) => (
                      <div key={`sel-${bookSelectionKey(b)}-${i}`} className="relative mx-auto w-[6.5rem] shrink-0">
                        {b.cover_url ? (
                          <img
                            src={b.cover_url}
                            alt={b.title ? `${b.title} 표지` : "선택 도서 표지"}
                            className="h-[10.75rem] w-[6.5rem] rounded-lg border border-slate-200 object-cover shadow-sm"
                          />
                        ) : (
                          <div className="flex h-[10.75rem] w-[6.5rem] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center text-[11px] text-slate-500">
                            표지 없음
                          </div>
                        )}
                        <button
                          type="button"
                          title="선택 해제"
                          aria-label={`${b.title || "도서"} 선택 해제`}
                          onClick={() => removeSelectedBookAt(i)}
                          className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-sm font-bold leading-none text-white shadow hover:bg-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
                {selectedBooks.length >= MAX_SELECTED_BOOKS ? (
                  <p className="mt-3 text-[11px] leading-snug text-amber-800">
                    이미 {MAX_SELECTED_BOOKS}권을 선택했습니다. 바꾸려면 표지 위 ×를 눌러 빼 주세요.
                  </p>
                ) : null}
              </aside>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <button type="button" onClick={goPrev} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                이전
              </button>
              <button
                type="button"
                disabled={!canGoNextFrom3}
                onClick={goNext}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                다음
              </button>
            </div>
            {!canGoNextFrom3 ? (
              <p className="text-xs text-amber-700">검색 결과에서 도서를 한 권 이상 선택해 주세요.</p>
            ) : null}
          </fieldset>
        ) : null}

        {wizardStep === 4 ? (
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-800">4. 5대 역량 (1~10점) 및 코멘트</legend>
            <div className="grid grid-cols-1 gap-4">
              {KEYS.map((k) => (
                <div key={k} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  <label className="text-sm font-medium text-slate-800">{pillarLabelsKo[k]}</label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    className="mt-2 block w-full"
                    value={scores[k]}
                    onChange={(e) => setScores((s) => ({ ...s, [k]: Number(e.target.value) }))}
                  />
                  <p className="text-xs text-slate-500">{scores[k]}점</p>
                  <label className="mt-2 block text-xs text-slate-600">
                    역량별 코멘트 (필수)
                    <textarea
                      className="mt-1 min-h-[64px] w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      value={pillarComments[k]}
                      onChange={(e) =>
                        setPillarComments((c) => ({
                          ...c,
                          [k]: e.target.value,
                        }))
                      }
                      placeholder="수업에서 관찰한 내용을 적어 주세요."
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <button type="button" onClick={goPrev} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                이전
              </button>
              <button
                type="button"
                disabled={!canGoNextFrom4}
                onClick={goNext}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                다음
              </button>
            </div>
            {!canGoNextFrom4 ? (
              <p className="text-xs text-amber-700">각 역량마다 코멘트를 한 글자 이상 입력해 주세요.</p>
            ) : null}
          </fieldset>
        ) : null}

        {wizardStep === 5 ? (
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-800">5. 선생님의 따뜻한 한마디</legend>
            <p className="text-xs text-slate-600">
              마음을 담아 적어 주세요. <strong>리포트 생성하기</strong>에서 앞 단계의 모든 입력과 함께 다듬어진 문장으로
              완성됩니다.
            </p>
            <textarea
              className="min-h-[100px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={warmDraft}
              onChange={(e) => setWarmDraft(e.target.value)}
              placeholder="예: 이번 달 ○○한 모습이 참 고마웠어요. 다음 달도 천천히 함께 가요."
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <button type="button" onClick={goPrev} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                이전
              </button>
              <button
                type="button"
                disabled={!canGenerateFrom5 || aiBusy}
                onClick={() => void runReportGeneration()}
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {aiBusy ? "리포트 생성 중…" : "리포트 생성하기"}
              </button>
            </div>
            {!warmDraft.trim() ? (
              <p className="text-xs text-amber-700">한마디 초안을 입력해 주세요.</p>
            ) : !canGoNextFrom1 || !canGoNextFrom2 || !canGoNextFrom3 || !canGoNextFrom4 ? (
              <p className="text-xs text-amber-700">앞 단계 입력이 모두 완료되어야 생성할 수 있습니다.</p>
            ) : null}
          </fieldset>
        ) : null}

        {wizardStep === 6 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
              <p>
                아래는 AI가 채운 리포트 미리보기입니다. 각 섹션 하단에서 수정할 수 있으며, 수정 내용은{" "}
                <strong>월간 리포트 저장</strong> 시 함께 저장됩니다.
              </p>
              {aiTokenUsage ? (
                <p className="mt-1.5 text-xs text-emerald-800/90">
                  Gemini 토큰 (리포트 생성 3회 합계) — 입력{" "}
                  {aiTokenUsage.inputTokens.toLocaleString("ko-KR")} · 출력{" "}
                  {aiTokenUsage.outputTokens.toLocaleString("ko-KR")}
                </p>
              ) : null}
            </div>

            <MonthlyReportResultView
              headerTitle={reportHeaderTitle(yearMonth)}
              growthText={growth}
              onGrowthChange={setGrowth}
              writingImageUrls={writingDisplayUrls}
              bookItems={bookDisplayItems}
              radarData={radarData100}
              competencyAnalysis={competencyAnalysis}
              onCompetencyChange={setCompetencyAnalysis}
              teacherNote={teacherNote}
              onTeacherChange={setTeacherNote}
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWizardStep(5)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                이전 단계로
              </button>
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => void runReportGeneration()}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
              >
                {aiBusy ? "생성 중…" : "다시 생성하기"}
              </button>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "저장 중…" : "월간 리포트 저장"}
            </button>
          </div>
        ) : null}

        {msg ? <p className="text-center text-sm text-slate-700">{msg}</p> : null}
      </form>
    </div>
  );
}
