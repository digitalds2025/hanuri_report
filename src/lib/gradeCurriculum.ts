import { formatSchoolGradeLabel, isSchoolGradeCode, type SchoolGradeCode } from "./schoolGrade";

export type GradeTransitionInfo = {
  fromLabel: string;
  toLabel: string;
  curriculumHighlights: string[];
  hanuriFocus: string;
};

const TRANSITIONS: Record<string, Omit<GradeTransitionInfo, "fromLabel" | "toLabel">> = {
  "E1->E2": {
    curriculumHighlights: ["한글·낱말 읽기 안정", "짧은 이야기 이해", "말하기·듣기 기초"],
    hanuriFocus: "그림책과 동화로 읽기 즐거움을 키우고, 짧은 문장 쓰기로 표현을 연습합니다.",
  },
  "E2->E3": {
    curriculumHighlights: ["문단 읽기", "주제·인물 파악", "일기·짧은 글쓰기"],
    hanuriFocus: "이야기 구조를 나누어 읽고, 읽은 내용을 자기 말로 정리하는 습관을 만듭니다.",
  },
  "E3->E4": {
    curriculumHighlights: ["설명문·정보 글 읽기", "요약하기", "토론 참여"],
    hanuriFocus: "비문학 글을 함께 읽으며 질문하고, 친구와 의견을 나누는 토론을 시작합니다.",
  },
  "E4->E5": {
    curriculumHighlights: ["논설문 쓰기", "추론적 읽기", "자기 주장 표현"],
    hanuriFocus: "근거를 들어 말하고, 짧은 논설형 글쓰기로 생각을 펼치는 연습을 이어갑니다.",
  },
  "E5->E6": {
    curriculumHighlights: ["비판적 읽기", "구조화된 글쓰기", "발표·토론"],
    hanuriFocus: "여러 관점을 비교하며 읽고, 초등 마무리 학년에 맞는 논술·토론 역량을 다집니다.",
  },
  "E6->M1": {
    curriculumHighlights: ["중학 교과 연계 독서", "논리적 글쓰기", "자료 활용"],
    hanuriFocus: "중학 국어·사회·과학 글의 읽기 전략을 미리 익히고, 근거 중심 글쓰기로 넘어갑니다.",
  },
  "M1->M2": {
    curriculumHighlights: ["비문학 심화", "논증 구조", "토론·발표"],
    hanuriFocus: "주장–근거–반론 구조를 읽고 쓰며, 중학 2학년 수준의 사고 확장을 돕습니다.",
  },
  "M2->M3": {
    curriculumHighlights: ["고입·내신 대비 독서", "논술·서술형", "통합적 사고"],
    hanuriFocus: "시험·논술에 필요한 읽기 속도와 구조화된 쓰기를 균형 있게 준비합니다.",
  },
  "M3->H1": {
    curriculumHighlights: ["고등 국어·논술 기초", "비판적 읽기", "자기 성찰 글쓰기"],
    hanuriFocus: "고등 국어와 연계된 독서·논술 기초를 다지고, 스스로 학습 계획을 세우도록 돕습니다.",
  },
  "H1->H2": {
    curriculumHighlights: ["수능·내신 연계", "논술·면접 대비", "심화 토론"],
    hanuriFocus: "수능 국어·논술에 필요한 읽기·쓰기 전략을 단계적으로 심화합니다.",
  },
  "H2->H3": {
    curriculumHighlights: ["수능 최종 점검", "논술 실전", "자기주도 학습"],
    hanuriFocus: "실전형 논술·토론과 시간 관리를 연습하며, 고3 마무리 학습 루틴을 함께 짭니다.",
  },
};

function nextGradeCode(code: SchoolGradeCode): SchoolGradeCode | null {
  const order: SchoolGradeCode[] = [
    "E1",
    "E2",
    "E3",
    "E4",
    "E5",
    "E6",
    "M1",
    "M2",
    "M3",
    "H1",
    "H2",
    "H3",
  ];
  const i = order.indexOf(code);
  if (i < 0 || i >= order.length - 1) return null;
  return order[i + 1] ?? null;
}

/** 현재 학년 코드 → 다음 학년 교육과정 하이라이트 */
export function gradeTransitionInfo(currentGradeCode: string): GradeTransitionInfo | null {
  const from = currentGradeCode.trim().toUpperCase();
  if (!isSchoolGradeCode(from)) return null;
  const to = nextGradeCode(from);
  if (!to) return null;
  const key = `${from}->${to}`;
  const row = TRANSITIONS[key];
  if (!row) {
    return {
      fromLabel: formatSchoolGradeLabel(from),
      toLabel: formatSchoolGradeLabel(to),
      curriculumHighlights: ["읽기·쓰기·토론 역량 심화"],
      hanuriFocus: "한우리 수업에서 다음 학년 교과에 맞춘 독서·논술·토론을 이어갑니다.",
    };
  }
  return {
    fromLabel: formatSchoolGradeLabel(from),
    toLabel: formatSchoolGradeLabel(to),
    ...row,
  };
}
