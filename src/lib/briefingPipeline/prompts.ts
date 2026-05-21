import type { BriefingPipelineInput } from "./types";

export function regionLabel(input: BriefingPipelineInput): string {
  return input.subRegion || input.region;
}

export function purposeLabelKo(purpose: BriefingPipelineInput["purpose"]): string {
  return purpose === "신입 모집" ? "초등 고학년 신규회원 모집" : "기존 재원생 관리·승급";
}

export function briefingPurposeText(input: BriefingPipelineInput): string {
  const custom = input.purposeCustom?.trim();
  if (custom) return custom;
  return purposeLabelKo(input.purpose);
}

function step1PurposeSearchHint(input: BriefingPipelineInput): string {
  const custom = input.purposeCustom?.trim();
  if (custom) {
    return `사용자가 정한 설명회 목적(「${custom}」)에 맞춰 검색·요약 우선순위를 스스로 판단. 상담·모집·승급·브랜드 소개 등 목적 문구를 그대로 반영`;
  }
  const isRecruit = input.purpose === "신입 모집";
  return isRecruit
    ? "학부모가 놓치기 쉬운 지역 교육·평가 변화, 중학교 진학 맥락을 우선 검색"
    : "재원생 승급·학습 공백 리스크, 다음 학년 평가 변화를 우선 검색";
}

function step1SearchHints(input: BriefingPipelineInput): string {
  const loc = `${input.region} ${regionLabel(input)}`.trim();
  const isElem = input.schoolLevel === "초등";
  const gradeHints = isElem
    ? `${input.targetGrade} 평가계획, 과정중심평가, 발표·토의·서술형, 중학교 준비`
    : input.schoolLevel === "중등"
      ? `${input.targetGrade} 지필평가, 수행평가, 내신, 고교학점제`
      : `${input.targetGrade} 대입, 내신, 진로`;
  return `검색 시 반드시 반영할 조건:
- 행정: ${loc} (시·군·구 단위로 검색)
- 대상: ${input.targetLabel}
- 목적: ${briefingPurposeText(input)} — ${step1PurposeSearchHint(input)}
- 학년 맞춤 키워드 예: ${loc} ${gradeHints}`;
}

export function step1ResearchPrompt(input: BriefingPipelineInput): string {
  const region = regionLabel(input);
  const locFull = `${input.region} ${region}`.trim();
  return `# 역할
너는 지정된 지역의 최신 교육 시장 구조와 학교 공시 정보를 구글 검색을 통해 실시간으로 추적하는 전문 로컬 교육 리서처다.

# 입력 조건 (모두 수집·요약에 반영)
- 시·도: ${input.region}
- 시·군·구: ${region}
- 학교급·학년: ${input.targetLabel} (${input.schoolLevel} / ${input.targetGrade})
- 설명회 목적: ${briefingPurposeText(input)}

${step1SearchHints(input)}

# 구글 검색 및 판단 지침
반드시 실시간 구글 검색을 수행하여 다음 3가지 카테고리의 팩트 데이터를 수집하고 요약해야 한다.
1. [학군 인프라]: ${locFull} 관내 중·고등학교 현황, 학교 수, 중학군/학구 배정, 고교학군 연계.
2. [학교별 평가 특징]: ${input.schoolLevel === "초등" ? "관내 초등학교" : input.schoolLevel === "중등" ? "관내 중학교" : "관내 고등학교"} 중심으로 학교알리미·학교 홈페이지의 ${input.targetGrade}·평가계획, 수행/지필·서논술형 등(서열 금지).
3. [지자체 자원]: ${region} 시청·${input.region}교육청·교육지원청 진로진학센터, 미래부모학교 등.

# 서술 원칙
- 학원 블로그·맘카페 배제. 학교알리미·시청·교육청 공식 데이터만.
- 각 섹션 끝에 데이터 확인 시점(YYYY-MM-DD 또는 연도) 명시.
- 서열화·단정 표현 금지. 비교 기준과 수치만.

# 출력 구조 (마크다운만)
## 1. 지역 학군 및 배정 구조 분석
- 내용:
- 데이터 확인 시점:

## 2. 주요 학교별 공시 및 평가 특징
- (학교명별 bullet)
- 데이터 확인 시점:

## 3. 지자체 공공 진학 자원 현황
- 내용:
- 데이터 확인 시점:`;
}

export function step2TopicsSystem(): string {
  return `수석 교육 마케팅 전략가. 아래는 학교알리미·교육청·KESS·어디가 등 공식 출처에서 수집한 **전건 리서치**다.
리서치를 임의로 요약하지 말고, 실제 학교명·수치·연도가 드러난 사실을 근거로 주제 3개를 제안한다.
브랜드: 한우리 독서토론논술(읽기·토론·쓰기, 과정중심, 문해력).
반드시 JSON만:
{
  "topics": [
    {
      "id": "t1",
      "title": "주제 제목",
      "subtitle": "부제",
      "localIssue": "로컬 핵심 이슈",
      "salesStrategy": "상담 전환 전술",
      "scores": {
        "dataReliability": { "score": 0, "rationale": "" },
        "localRelevance": { "score": 0, "rationale": "" },
        "ctaConversion": { "score": 0, "rationale": "" },
        "brandAlignment": { "score": 0, "rationale": "" }
      }
    }
  ]
}
각 score는 0~100. topics는 정확히 3개.`;
}

export function step2TopicsUser(
  researchMd: string,
  input: BriefingPipelineInput,
  factCount = 0,
): string {
  return `Step 1 공식 리서치 원본 (${factCount}건, 요약·생략 금지):
${researchMd}

모집 목적: ${briefingPurposeText(input)}${input.purposeCustom?.trim() ? "" : ` (${input.purpose})`}
타겟: ${input.targetLabel}
주제 rationale에는 반드시 리서치에 나온 학교명 또는 공식 수치를 인용하라.`;
}

export function step3ManuscriptPrompt(
  input: BriefingPipelineInput,
  topic: { title: string; subtitle: string; localIssue: string },
  factCount = 0,
): string {
  return `# 역할
프레젠테이션 카피라이터·스피치 코치. Apple 스타일 미니멀 설명회 슬라이드 원고(약 18~22장).

# 조건
- 주제: ${topic.title} — ${topic.subtitle}
- 지역: ${input.region} ${regionLabel(input)}
- 대상: ${input.targetLabel}
- 설명회 목적: ${briefingPurposeText(input)}
- 첨부 리서치는 공식 출처 ${factCount}건 전건이다. **임의 요약·생략·할루시네이션 금지.**
- 슬라이드마다 리서치의 실제 학교명·수치·연도·출처 발췌 내용을 최대한 반영 (한 슬라이드에 여러 학교/수치 가능)
- 화면 텍스트는 명사형 bullet 3~4개, 줄글 금지

# 슬라이드별 4영역 (마크다운)
각 슬라이드:
---
## Slide {n}: [제목]
- **레이아웃 타입**: TITLE|METRIC|COMPARISON|CHECKLIST|SECTION|CTA 등
- **Slide Text**:
  * bullet1
  * bullet2
- **Presenter Script**: "구어체 대사..."
- **Instructor Insight (노란 박스)**:
  > [💡 강사 가이드] 현장 팁...
---

마지막은 상담 CTA 슬라이드. 서열·과장 금지.`;
}

export function step4CompileSystem(): string {
  return `마크다운 설명회 원고를 PPTX 렌더러용 JSON으로만 변환. 서론 없이 JSON만.
스키마:
{
  "presentation_title": "string",
  "total_slides_count": number,
  "slides": [{
    "slide_index": number,
    "layout_type": "string",
    "slide_title": "string",
    "content_bullets": ["string"],
    "presenter_script": "string",
    "instructor_insight": "string"
  }]
}`;
}
