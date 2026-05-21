import type {
  BriefingLayoutSlide,
  BriefingMaterialFormInput,
  GuardrailIssue,
  GuardrailReport,
} from "./briefingMaterialTypes";

const RANKING_PATTERNS = [
  /보다\s+(높|낮|우수|열등)/,
  /무조건\s+(유리|불리|좋|나쁘)/,
  /(\d+)위\s*학교/,
  /최고\s*의?\s*학교/,
  /반드시\s+가야/,
  /A중학교.*B중학교/,
];

const HYPE_PATTERNS = [
  /업계\s*1위/,
  /압도적/,
  /완벽\s*해결/,
  /100%\s*보장/,
  /무조건\s*성적/,
];

function collectSlideText(slide: BriefingLayoutSlide): string {
  const parts: string[] = [slide.type];
  for (const v of Object.values(slide)) {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") parts.push(item);
        else if (item && typeof item === "object") {
          parts.push(JSON.stringify(item));
        }
      }
    }
  }
  return parts.join(" ");
}

export function runBriefingGuardrails(
  slides: BriefingLayoutSlide[],
  input: BriefingMaterialFormInput,
  dataAsOf: string,
): GuardrailReport {
  const issues: GuardrailIssue[] = [];
  const regionToken = input.subRegion.replace(/\s/g, "");
  const gradeToken = input.targetGrade;

  slides.forEach((slide, idx) => {
    const text = collectSlideText(slide);

    if (regionToken && !text.includes(input.subRegion) && slide.type !== "TITLE" && slide.type !== "SOURCES") {
      issues.push({
        severity: "warning",
        code: "REGION_MISMATCH",
        message: `슬라이드 ${idx + 1}: 선택 지역「${input.subRegion}」표기가 없습니다.`,
        slideIndex: idx,
        suggestion: `지역명「${input.subRegion}」을 제목 또는 본문에 명시하세요.`,
      });
    }

    if (!text.includes(gradeToken) && !text.includes(input.schoolLevel) && slide.type !== "SOURCES") {
      issues.push({
        severity: "info",
        code: "GRADE_HINT",
        message: `슬라이드 ${idx + 1}: 대상 학년「${gradeToken}」표기를 권장합니다.`,
        slideIndex: idx,
      });
    }

    for (const pat of RANKING_PATTERNS) {
      if (pat.test(text)) {
        issues.push({
          severity: "error",
          code: "RANKING_LANGUAGE",
          message: `슬라이드 ${idx + 1}: 서열·단정 표현이 감지되었습니다.`,
          slideIndex: idx,
          suggestion: "‘추천’ 대신 ‘비교 기준(평가 방식·프로그램·진로)’ 형태로 수정하세요.",
        });
        break;
      }
    }

    for (const pat of HYPE_PATTERNS) {
      if (pat.test(text)) {
        issues.push({
          severity: "warning",
          code: "HYPE_TONE",
          message: `슬라이드 ${idx + 1}: 과장·영업 톤 표현이 감지되었습니다.`,
          slideIndex: idx,
          suggestion: "사실 기반·상담 연결 톤으로 완화하세요.",
        });
        break;
      }
    }
  });

  const hasSourcesSlide = slides.some((s) => s.type === "SOURCES" || String(s.title ?? "").includes("기준 시점"));
  if (!hasSourcesSlide) {
    issues.push({
      severity: "warning",
      code: "MISSING_DATA_AS_OF",
      message: `문서에「지역 자료 기준 시점: ${dataAsOf}」표기 슬라이드가 없습니다.`,
      suggestion: "마지막에 SOURCES 타입 슬라이드를 포함하세요.",
    });
  }

  const errors = issues.filter((i) => i.severity === "error");
  return {
    passed: errors.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  };
}
