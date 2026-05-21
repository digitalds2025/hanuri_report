import { runBriefingGuardrails } from "../briefingGuardrails";
import type {
  BriefingLayoutSlide,
  BriefingMaterialFormInput,
  GuardrailReport,
} from "../briefingMaterialTypes";

const RANKING_EXTRA = [
  /#1등/,
  /#최고/,
  /낙후/,
  /최상위/,
  /하위권/,
];

export function runLocalEduGuardrails(
  slides: BriefingLayoutSlide[],
  form: BriefingMaterialFormInput,
  dataAsOf: string,
  fullTextCorpus: string,
): GuardrailReport {
  const base = runBriefingGuardrails(slides, form, dataAsOf);
  const issues = [...base.issues];

  if (!fullTextCorpus.includes(dataAsOf) && !fullTextCorpus.includes("기준 시점")) {
    issues.push({
      severity: "warning",
      code: "MISSING_DATA_AS_OF_CORPUS",
      message: `전체 원고에「지역 자료 기준 시점: ${dataAsOf}」표기가 없습니다.`,
      suggestion: "표지·출처 블록에 기준 시점을 명시하세요.",
    });
  }

  for (const pat of RANKING_EXTRA) {
    if (pat.test(fullTextCorpus)) {
      issues.push({
        severity: "error",
        code: "RANKING_HASHTAG",
        message: "서열화 해시태그·단정 표현이 감지되었습니다.",
        suggestion: "비교 기준(평가 방식·프로그램) 형태로 수정하세요.",
      });
      break;
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  return {
    passed: errors.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  };
}
