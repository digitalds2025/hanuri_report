import { useMemo, useState, type ReactNode } from "react";
import { parseCompetencySections } from "../../lib/parseCompetencySections";
import {
  competencyAnalysisToMReportComments,
  joinCompetencyMReportComments,
} from "../../lib/competencyAnalysisSplit";
import {
  MONTHLY_REPORT_BOOK_COVER_IMG_CLASS,
  monthlyReportSectionPaddingStyle,
} from "../../lib/monthlyReportLayout";

export type RadarDatum = { subject: string; score: number };

type PolygonRadarChartProps = {
  data: RadarDatum[];
};

/** N각형 방사형 차트 (점수 0~100) */
export function PolygonRadarChart({ data }: PolygonRadarChartProps) {
  const size = 300;
  const center = size / 2;
  const radius = 100;
  const levels = 5;
  const totalPoints = data.length;
  if (totalPoints < 3) {
    return (
      <p className="text-center text-sm text-gray-500">역량 항목이 3개 이상일 때 차트가 표시됩니다.</p>
    );
  }

  const getPoint = (value: number, index: number, total: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const r = (Math.min(100, Math.max(0, value)) / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const gridPolygons = Array.from({ length: levels }).map((_, levelIndex) => {
    const levelValue = (100 / levels) * (levelIndex + 1);
    const points = data.map((_, i) => getPoint(levelValue, i, totalPoints));
    const pointString = points.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <polygon
        key={`grid-${levelIndex}`}
        points={pointString}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={1}
      />
    );
  });

  const axes = data.map((_, i) => {
    const p = getPoint(100, i, totalPoints);
    return (
      <line
        key={`axis-${i}`}
        x1={center}
        y1={center}
        x2={p.x}
        y2={p.y}
        stroke="#e5e7eb"
        strokeWidth={1}
      />
    );
  });

  const dataPoints = data.map((d, i) => getPoint(d.score, i, totalPoints));
  const dataPointString = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg width="100%" height="100%" viewBox="0 0 300 300" className="mx-auto max-w-[280px]">
      {gridPolygons}
      {axes}
      <polygon
        points={dataPointString}
        fill="rgba(252, 211, 77, 0.4)"
        stroke="#fbbf24"
        strokeWidth={2}
      />
      {data.map((d, i) => {
        const labelPoint = getPoint(118, i, totalPoints);
        return (
          <text
            key={`label-${i}`}
            x={labelPoint.x}
            y={labelPoint.y}
            textAnchor="middle"
            alignmentBaseline="middle"
            fill="#4b5563"
            fontSize={11}
            fontWeight={600}
          >
            {d.subject}
          </text>
        );
      })}
    </svg>
  );
}

type ReportSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
  /** 흰색 본문 카드에 추가 클래스 (나란히 배치 시 flex-1 등) */
  contentClassName?: string;
  /** 리본 타이틀 오른쪽 (수정 / 저장·취소)1 */
  headerRight?: ReactNode;
};

export function ReportSection({
  title,
  children,
  className = "",
  contentClassName = "",
  headerRight,
}: ReportSectionProps) {
  return (
    <div className={`mb-10 ${className}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="relative inline-block min-w-0">
          <div className="relative z-10 rounded-br-md rounded-tr-md bg-[#9bbdff] pl-8 pr-6 py-2.5 text-lg font-bold text-[#1a3b6b] shadow-sm">
            {title}
          </div>
          <div className="absolute top-0 left-[-8px] z-0 h-0 w-0 border-b-[14px] border-r-[10px] border-t-[30px] border-transparent border-r-[#7da6f0]" />
          <div className="absolute bottom-[-6px] left-0 z-0 h-0 w-0 border-r-[8px] border-t-[6px] border-transparent border-t-[#668bc7]" />
        </div>
        {headerRight ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 pb-0.5">{headerRight}</div>
        ) : null}
      </div>

      <div
        className={`relative bg-white text-[15px] leading-relaxed text-gray-800 shadow-sm ${contentClassName}`}
        style={monthlyReportSectionPaddingStyle()}
      >
        {children}
        <div className="absolute bottom-0 right-0 h-0 w-0 border-b-[20px] border-l-[20px] border-b-transparent border-l-gray-100/50" />
        <div className="absolute bottom-0 right-0 h-5 w-5 bg-gradient-to-tl from-gray-200 to-transparent" />
      </div>
    </div>
  );
}

const editTextareaClass =
  "w-full min-h-[160px] resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-[15px] leading-relaxed text-gray-800 shadow-inner outline-none focus:border-[#9bbdff] focus:ring-1 focus:ring-[#9bbdff]";

const btnBase =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
const btnEdit = `${btnBase} border border-[#1a3b6b]/30 bg-white text-[#1a3b6b] hover:bg-[#eaf1f9]`;
const btnPrimary = `${btnBase} bg-[#1a3b6b] text-white hover:bg-[#2a5b9c]`;
const btnGhost = `${btnBase} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;

type EditSection = "growth" | "analysis" | "teacher";

export type MonthlyReportResultViewProps = {
  headerTitle: string;
  growthTitle?: string;
  growthText: string;
  onGrowthChange: (v: string) => void;
  writingTitle?: string;
  writingImageUrls: string[];
  booksTitle?: string;
  bookItems: { image: string; keywords: string[] }[];
  analysisTitle?: string;
  radarData: RadarDatum[];
  competencyAnalysis: string;
  onCompetencyChange: (v: string) => void;
  teacherTitle?: string;
  teacherNote: string;
  onTeacherChange: (v: string) => void;
  /** true면 수정 버튼·편집 UI 숨김 (JPG/PDF 캡처용) */
  readOnly?: boolean;
};

export function MonthlyReportResultView({
  headerTitle,
  growthTitle = "이달의 '성장 모멘트'",
  growthText,
  onGrowthChange,
  writingTitle = "이달의 글쓰기",
  writingImageUrls,
  booksTitle = "이달의 도서 키워드",
  bookItems,
  analysisTitle = "관찰 기반 역량 종합 분석",
  radarData,
  competencyAnalysis,
  onCompetencyChange,
  teacherTitle = "선생님의 따뜻한 한마디",
  teacherNote,
  onTeacherChange,
  readOnly = false,
}: MonthlyReportResultViewProps) {
  const [editingSection, setEditingSection] = useState<EditSection | null>(null);
  const [draftGrowth, setDraftGrowth] = useState("");
  const [draftStrength, setDraftStrength] = useState("");
  const [draftWeakness, setDraftWeakness] = useState("");
  const [draftTeacher, setDraftTeacher] = useState("");

  const { strength, weakness } = useMemo(
    () => parseCompetencySections(competencyAnalysis),
    [competencyAnalysis],
  );

  const growthParagraphs = useMemo(() => {
    const t = growthText.trim();
    if (!t) return [];
    return t
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [growthText]);

  const teacherParagraphs = useMemo(() => {
    const t = teacherNote.trim();
    if (!t) return [];
    return t
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [teacherNote]);

  const writingUrls =
    writingImageUrls.length > 0
      ? writingImageUrls
      : ["https://placehold.co/400x500/fdfbf2/333333?text=Writing"];

  const displayBooks =
    bookItems.length > 0
      ? bookItems
      : [
          {
            image: "https://placehold.co/300x400/e6f2ff/1a3b6b?text=Book",
            keywords: ["#도서", "#키워드"],
          },
        ];

  function startEdit(section: EditSection) {
    if (editingSection && editingSection !== section) {
      setEditingSection(null);
    }
    if (section === "growth") setDraftGrowth(growthText);
    if (section === "analysis") {
      const s = competencyAnalysisToMReportComments(competencyAnalysis);
      setDraftStrength(s.strength_cmt ?? "");
      setDraftWeakness(s.weakness_cmt ?? "");
    }
    if (section === "teacher") setDraftTeacher(teacherNote);
    setEditingSection(section);
  }

  function cancelEdit() {
    setEditingSection(null);
  }

  function saveGrowth() {
    onGrowthChange(draftGrowth);
    setEditingSection(null);
  }

  function saveAnalysis() {
    onCompetencyChange(joinCompetencyMReportComments(draftStrength, draftWeakness));
    setEditingSection(null);
  }

  function saveTeacher() {
    onTeacherChange(draftTeacher);
    setEditingSection(null);
  }

  function sectionActions(section: EditSection, onSave: () => void) {
    if (editingSection === section) {
      return (
        <>
          <button type="button" className={btnPrimary} onClick={onSave}>
            저장
          </button>
          <button type="button" className={btnGhost} onClick={cancelEdit}>
            취소
          </button>
        </>
      );
    }
    return (
      <button type="button" className={btnEdit} onClick={() => startEdit(section)}>
        수정
      </button>
    );
  }

  return (
    <div id="hanuri-export-root" className="rounded-xl bg-[#eaf1f9] py-6 font-sans">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="relative mb-8 overflow-hidden rounded-t-xl bg-gradient-to-r from-[#d9e8fb] to-[#c2dcf9] px-8 pt-12 pb-10">
          <div className="absolute top-0 right-0 h-64 w-64 translate-x-1/3 -translate-y-1/2 rounded-full bg-white/30 blur-3xl" />
          <h1 className="relative z-10 text-3xl font-extrabold text-[#2a5b9c] md:text-4xl">{headerTitle}</h1>
        </div>

        <ReportSection
          title={growthTitle}
          headerRight={readOnly ? undefined : sectionActions("growth", saveGrowth)}
        >
          {!readOnly && editingSection === "growth" ? (
            <textarea
              className={editTextareaClass + " min-h-[200px]"}
              value={draftGrowth}
              onChange={(e) => setDraftGrowth(e.target.value)}
              placeholder="성장 모멘트 전체를 편집합니다. 문단 구분은 빈 줄 두 줄(엔터 두 번)로 하면 미리보기에서 나뉩니다."
              aria-label="성장 모멘트 편집"
            />
          ) : (
            <div className="space-y-4 text-gray-700">
              {growthParagraphs.length > 0 ? (
                growthParagraphs.map((p, index) => (
                  <p key={index} className="whitespace-pre-line">
                    {p}
                  </p>
                ))
              ) : (
                <p className="text-gray-500">성장 모멘트 내용을 입력하거나 AI로 생성해 주세요.</p>
              )}
            </div>
          )}
        </ReportSection>

        <div className="mb-10 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-stretch">
          <ReportSection
            title={writingTitle}
            className="mb-0 flex h-full flex-col"
            contentClassName="flex flex-1 flex-col justify-center"
          >
            <div
              className={`flex justify-center gap-4 ${writingUrls.length === 1 ? "flex-col items-center sm:flex-row" : "flex-wrap"}`}
            >
              {writingUrls.map((imgUrl, index) => (
                <div
                  key={index}
                  className={`bg-gray-50 shadow-sm ${writingUrls.length === 1 ? "w-full max-w-sm border border-gray-100" : "w-1/2 min-w-[140px] flex-1 border border-gray-100"}`}
                  style={monthlyReportSectionPaddingStyle()}
                >
                  <img
                    src={imgUrl}
                    alt={`글쓰기 ${index + 1}`}
                    className="h-auto w-full object-cover"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ))}
            </div>
          </ReportSection>

          <ReportSection
            title={booksTitle}
            className="mb-0 flex h-full flex-col"
            contentClassName="flex flex-1 flex-col justify-center"
          >
            <div className="flex flex-wrap justify-center gap-6">
              {displayBooks.map((item, index) => (
                <div key={index} className="flex shrink-0 flex-col items-center">
                  <div
                    className="inline-block border border-gray-100 bg-gray-50 shadow-sm"
                    style={monthlyReportSectionPaddingStyle()}
                  >
                    <img
                      src={item.image}
                      alt={`도서 ${index + 1}`}
                      className={MONTHLY_REPORT_BOOK_COVER_IMG_CLASS}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                    {item.keywords.map((kw, i) => (
                      <span key={i} className="text-sm font-bold text-gray-700">
                        {kw.startsWith("#") ? kw : `#${kw}`}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ReportSection>
        </div>

        <ReportSection
          title={analysisTitle}
          headerRight={readOnly ? undefined : sectionActions("analysis", saveAnalysis)}
        >
          {!readOnly && editingSection === "analysis" ? (
            <div className="space-y-6">
              <div className="flex justify-center md:justify-start">
                <PolygonRadarChart data={radarData} />
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">[강점]</label>
                <textarea
                  className={editTextareaClass + " min-h-[140px] text-sm"}
                  value={draftStrength}
                  onChange={(e) => setDraftStrength(e.target.value)}
                  placeholder="강점에 해당하는 문단을 입력합니다."
                  aria-label="역량 분석 강점 편집"
                />
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">[보완점]</label>
                <textarea
                  className={editTextareaClass + " min-h-[140px] text-sm"}
                  value={draftWeakness}
                  onChange={(e) => setDraftWeakness(e.target.value)}
                  placeholder="보완점에 해당하는 문단을 입력합니다."
                  aria-label="역량 분석 보완점 편집"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:gap-12">
              <div className="relative w-full shrink-0 md:w-1/3">
                <PolygonRadarChart data={radarData} />
              </div>

              <div className="w-full space-y-6 md:w-2/3">
                <div>
                  <h3 className="mb-2 font-bold text-[#1a3b6b]">{strength.label}</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 md:text-base">
                    {strength.text}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 font-bold text-[#1a3b6b]">{weakness.label}</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 md:text-base">
                    {weakness.text}
                  </p>
                </div>
              </div>
            </div>
          )}
        </ReportSection>

        <ReportSection
          title={teacherTitle}
          headerRight={readOnly ? undefined : sectionActions("teacher", saveTeacher)}
        >
          {!readOnly && editingSection === "teacher" ? (
            <textarea
              className={editTextareaClass + " min-h-[140px]"}
              value={draftTeacher}
              onChange={(e) => setDraftTeacher(e.target.value)}
              placeholder="선생님의 따뜻한 한마디를 편집합니다."
              aria-label="선생님 한마디 편집"
            />
          ) : (
            <div className="space-y-4 font-medium text-gray-700">
              {teacherParagraphs.length > 0 ? (
                teacherParagraphs.map((p, index) => (
                  <p key={index} className="leading-loose whitespace-pre-line">
                    {p}
                  </p>
                ))
              ) : (
                <p className="text-gray-500">선생님 한마디를 입력해 주세요.</p>
              )}
            </div>
          )}
        </ReportSection>
      </div>
    </div>
  );
}
