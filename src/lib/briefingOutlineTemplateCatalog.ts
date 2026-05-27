import type { MasterOutlineBlock, StoryPhase } from "./briefingMaterialTypes";

export type OutlineTemplateCategory =
  | "opening"
  | "local"
  | "school"
  | "grade"
  | "evaluation"
  | "parent"
  | "solution"
  | "data"
  | "closing";

export type OutlineBlockTemplate = {
  blockId: string;
  category: OutlineTemplateCategory;
  title: string;
  purpose: string;
  bulletPoints: string[];
  tags: string[];
  storyPhases: StoryPhase[];
  bestFor: ("ppt" | "docx")[];
  /** 슬라이드 1장 이상 권장 여부 */
  multiSlide?: boolean;
};

function tpl(
  blockId: string,
  category: OutlineTemplateCategory,
  title: string,
  purpose: string,
  bulletPoints: string[],
  opts?: Partial<Pick<OutlineBlockTemplate, "tags" | "storyPhases" | "bestFor" | "multiSlide">>,
): OutlineBlockTemplate {
  return {
    blockId,
    category,
    title,
    purpose,
    bulletPoints,
    tags: opts?.tags ?? [],
    storyPhases: opts?.storyPhases ?? ["development"],
    bestFor: opts?.bestFor ?? ["ppt", "docx"],
    multiSlide: opts?.multiSlide,
  };
}

/** 설명회·자료집용 아웃라인 블록 템플릿 50종 */
export const OUTLINE_TEMPLATE_CATALOG: OutlineBlockTemplate[] = [
  // opening (6)
  tpl("cover", "opening", "표지 · 주제", "설명회 제목·대상·일시", ["주제 한 줄", "지역·학년·목적", "기준 시점"], {
    storyPhases: ["intro"],
    bestFor: ["ppt"],
  }),
  tpl("how_to_read", "opening", "자료 읽는 법", "근거 등급·해석 원칙", ["A/B/C/D 등급", "공식 자료 우선", "단정·서열 금지"], {
    storyPhases: ["intro"],
    bestFor: ["docx", "ppt"],
  }),
  tpl("agenda", "opening", "오늘의 흐름", "설명회 아젠다", ["도입", "데이터", "전략", "상담"], { storyPhases: ["intro"] }),
  tpl("speaker_intro", "opening", "강사·센터 소개", "신뢰 형성", ["경력 요약", "지역 활동", "상담 방식"], {
    storyPhases: ["intro"],
    bestFor: ["ppt"],
  }),
  tpl("parent_pain", "opening", "학부모 고민 맵", "문제 인식 공유", ["불안 키워드", "자주 묻는 질문", "오해 정리"], {
    storyPhases: ["intro"],
    tags: ["신입 모집"],
  }),
  tpl("learning_goal", "opening", "오늘의 학습 목표", "기대치 설정", ["알게 될 것 3가지", "가져갈 액션"], {
    storyPhases: ["intro"],
  }),

  // local (8)
  tpl("local_context", "local", "지역 학습·진학 환경", "행정·학군·인프라", ["중학군 구조", "지자체 프로그램", "지역 이슈"], {
    storyPhases: ["intro", "development"],
    multiSlide: true,
    tags: ["지역"],
  }),
  tpl("middle_school_district", "local", "중학군·배정", "배정 원칙·변동", ["통학권", "배정 방식", "최근 변화"], {
    tags: ["초등", "중등"],
    multiSlide: true,
  }),
  tpl("high_school_map", "local", "고교 유형·지도", "일반·특목·특성화", ["학교 유형", "선발 방식", "지역 고교 분포"], {
    tags: ["중등", "고등"],
  }),
  tpl("demographics", "local", "학령·인구 추이", "수요·경쟁 맥락", ["학령인구", "학급당 학생", "지역 비교"], { bestFor: ["docx"] }),
  tpl("policy_timeline", "local", "교육 정책 타임라인", "시행 시점", ["정책명", "적용 학년", "가정 대응"], { multiSlide: true }),
  tpl("public_programs", "local", "지자체·교육청 프로그램", "공공 지원", ["프로그램명", "대상", "신청 방법"], { bestFor: ["docx"] }),
  tpl("commute_lifestyle", "local", "통학·생활권", "실생활 선택", ["통학 시간", "학원가", "안전·환경"], { tags: ["지역"] }),
  tpl("regional_competition", "local", "지역 내 경쟁도", "체감 경쟁", ["내신 밀도", "학원 이용", "상담 포인트"], {
    tags: ["중등"],
  }),

  // school (10)
  tpl("school_compare", "school", "학교 비교 프레임", "서열 아닌 기준 비교", ["비교 축", "공식 수치만", "선택 질문"], {
    multiSlide: true,
  }),
  tpl("school_profile", "school", "대표 학교 프로필", "학교 1곳 심화", ["교육과정", "특색", "진로"], { multiSlide: true }),
  tpl("school_evaluation_plan", "school", "평가계획서 해부", "수행·지필 구조", ["영역별 비중", "서술형", "일정"], {
    multiSlide: true,
    tags: ["수행평가"],
  }),
  tpl("school_student_metrics", "school", "학생 수·학급 규모", "규모 지표", ["학생 수", "학급 수", "학년별"], { bestFor: ["ppt"] }),
  tpl("school_club_activities", "school", "동아리·체험", "비교과", ["동아리 유형", "실적", "진로 연계"], { bestFor: ["docx"] }),
  tpl("school_teacher_quality", "school", "교원·학습 환경", "교육 여건", ["교원 1인당", "시설", "프로그램"], { bestFor: ["docx"] }),
  tpl("school_admission_results", "school", "진학·합격 흐름", "결과 데이터", ["진학률", "목표 고교", "추이"], { tags: ["중등"] }),
  tpl("feeder_schools", "school", "진학 연계 학교", "배치·연계", ["주요 진학처", "비율", "주의점"], { tags: ["초등"] }),
  tpl("school_alumni_track", "school", "졸업생·진로 사례", "사례 참고", ["진로 분포", "사례 2~3", "한계 안내"], { bestFor: ["docx"] }),
  tpl("school_selection_checklist", "school", "학교 선택 체크", "가정 점검", ["공식 확인 항목", "방문·설명회", "질문 리스트"], {
    tags: ["초등", "중등"],
  }),

  // grade (7)
  tpl("target_focus", "grade", "대상 학년 핵심", "학년별 1차 메시지", ["핵심 이슈", "준비 시점", "공식 자료"], {
    storyPhases: ["development"],
    multiSlide: true,
  }),
  tpl("grade_transition", "grade", "승급·전환기", "학년 넘김 리스크", ["바뀌는 평가", "공백 구간", "루틴"], {
    tags: ["기존 학생"],
  }),
  tpl("elem_to_middle", "grade", "초→중 전환", "중학 준비", ["배정", "평가 변화", "습관"], { tags: ["초등"] }),
  tpl("middle_to_high", "grade", "중→고 전환", "고교 선택", ["내신", "면접·특목", "학군"], { tags: ["중등"] }),
  tpl("credit_system", "grade", "고교학점제", "학점·선택과목", ["이수 단위", "진로 연계", "일정"], { tags: ["중등", "고등"] }),
  tpl("exam_timeline", "grade", "평가·시험 일정", "연간 캘린더", ["지필", "수행", "모의"], { multiSlide: true }),
  tpl("literacy_roadmap", "grade", "문해력·독서 로드맵", "읽기·쓰기", ["학년 기대", "가정 독서", "토론"], {
    tags: ["초등"],
  }),

  // evaluation (6)
  tpl("performance_eval", "evaluation", "수행평가 구조", "과정 평가", ["영역", "루브릭", "가정 지원"], {
    multiSlide: true,
    tags: ["수행평가"],
  }),
  tpl("written_exam", "evaluation", "지필·내신", "결과 평가", ["반영 비율", "난이도", "대비"], { tags: ["중등"] }),
  tpl("essay_narrative", "evaluation", "서술형·논술", "쓰기 역량", ["유형", "채점 포인트", "연습"], { multiSlide: true }),
  tpl("presentation_discussion", "evaluation", "발표·토론", "말하기 평가", ["평가 요소", "준비법", "실수 패턴"], { tags: ["초등"] }),
  tpl("portfolio_records", "evaluation", "생기부·세특", "기록 관리", ["기록 원칙", "활동 설계", "주의"], { tags: ["중등", "고등"] }),
  tpl("mock_exam_analysis", "evaluation", "모의·성적 해석", "성적 읽기", ["등급", "변동", "상담 질문"], { tags: ["중등", "고등"] }),

  // parent (6)
  tpl("parent_qa", "parent", "학부모 Q&A", "현장 질문", ["Q1~3", "공식 답변", "상담 연결"], { storyPhases: ["development", "climax"] }),
  tpl("misconceptions", "parent", "흔한 오해", "오해 바로잡기", ["오해", "사실", "출처"], { storyPhases: ["development"] }),
  tpl("home_support", "parent", "가정 지원 가이드", "실천 가능한 팁", ["일상 루틴", "금지 사항", "도구"], { bestFor: ["docx"] }),
  tpl("checklist", "parent", "체크리스트", "다음 단계 점검", ["항목 5~7", "기한", "담당"], { storyPhases: ["closing"] }),
  tpl("consultation_prep", "parent", "상담 준비", "상담 전 준비", ["가져올 자료", "질문", "목표"], { storyPhases: ["closing"] }),
  tpl("faq_deep_dive", "parent", "심화 FAQ", "주제별 Q&A", ["주제별 2문답", "출처"], { bestFor: ["docx"], multiSlide: true }),

  // solution (5)
  tpl("brand_solution", "solution", "한우리 솔루션", "프로그램 연결", ["독서·토론·논술", "학년 과정", "상담 CTA"], {
    storyPhases: ["climax"],
  }),
  tpl("program_roadmap", "solution", "학년별 프로그램", "로드맵", ["단계", "목표", "기간"], { storyPhases: ["climax"] }),
  tpl("success_story", "solution", "현장 사례", "사례 1건", ["상황", "개입", "결과(과장 금지)"], { bestFor: ["ppt"] }),
  tpl("differentiation", "solution", "차별 포인트", "왜 한우리", ["방법론", "코칭", "데이터"], { storyPhases: ["climax"] }),
  tpl("pricing_schedule", "solution", "일정·등록 안내", "운영 정보", ["개강", "상담 일정", "연락처"], { storyPhases: ["closing"], bestFor: ["ppt"] }),

  // data (4)
  tpl("data_spotlight", "data", "데이터 스포트라이트", "핵심 수치 1건", ["수치", "출처", "해석"], { bestFor: ["ppt"], multiSlide: true }),
  tpl("trend_chart", "data", "추이·변화", "시계열", ["전년 대비", "그래프 해석", "전망"], { bestFor: ["ppt"] }),
  tpl("comparison_matrix", "data", "비교 매트릭스", "다항목 비교", ["축", "A/B", "선택 가이드"], { bestFor: ["ppt"] }),
  tpl("stat_summary", "data", "통계 요약", "복수 지표", ["지표 3~5", "한 줄 해석"], { bestFor: ["ppt"] }),

  // closing (8)
  tpl("action_plan", "closing", "실행 계획", "다음 4주", ["주차별", "가정·학원", "점검"], { storyPhases: ["closing"] }),
  tpl("risk_mitigation", "closing", "리스크·대비", "공백 예방", ["리스크", "신호", "대응"], { storyPhases: ["closing"] }),
  tpl("resources_links", "closing", "공식 링크 모음", "북마크", ["학교알리미", "교육청", "포털"], { bestFor: ["docx"] }),
  tpl("sources", "closing", "출처·기준 시점", "근거 목록", ["기준일", "A등급", "B등급"], { storyPhases: ["closing"] }),
  tpl("cta", "closing", "상담 CTA", "행동 유도", ["예약", "준비물", "연락처"], { storyPhases: ["closing"], bestFor: ["ppt"] }),
  tpl("appendix", "closing", "부록", "심화 자료", ["표", "용어", "추가 링크"], { bestFor: ["docx"] }),
  tpl("glossary", "closing", "용어 사전", "용어 정리", ["용어 5~10", "한 줄 정의"], { bestFor: ["docx"] }),
  tpl("feedback_survey", "closing", "설문·피드백", "현장 수집", ["만족도", "추가 질문", "연락 동의"], { bestFor: ["ppt"] }),
];

export const OUTLINE_TEMPLATE_BY_ID = new Map(
  OUTLINE_TEMPLATE_CATALOG.map((t) => [t.blockId, t]),
);

export function getOutlineTemplate(blockId: string): OutlineBlockTemplate | undefined {
  return OUTLINE_TEMPLATE_BY_ID.get(blockId);
}

export function templateToOutlineBlock(
  t: OutlineBlockTemplate,
  overrides?: Partial<MasterOutlineBlock>,
): MasterOutlineBlock {
  return {
    blockId: t.blockId,
    title: overrides?.title ?? t.title,
    purpose: overrides?.purpose ?? t.purpose,
    bulletPoints: overrides?.bulletPoints?.length ? overrides.bulletPoints : [...t.bulletPoints],
    dataGradesUsed: overrides?.dataGradesUsed ?? ["A", "B"],
    instructorInsightSlots: overrides?.instructorInsightSlots,
    sources: overrides?.sources,
  };
}

export function catalogSummaryForPrompt(maxItems = 50): string {
  return OUTLINE_TEMPLATE_CATALOG.slice(0, maxItems)
    .map(
      (t) =>
        `- ${t.blockId} [${t.category}] ${t.title} | ${t.purpose} | phases:${t.storyPhases.join(",")} | ${t.bestFor.join("+")}${t.multiSlide ? " | multiSlide" : ""}`,
    )
    .join("\n");
}

/** 레거시 10블록 골격 — 폴백용 */
export { buildOutlineSkeleton, PPT_PRIORITY_BLOCKS } from "./briefingOutlineTemplates";
