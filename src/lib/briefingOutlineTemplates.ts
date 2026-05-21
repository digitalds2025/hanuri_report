import type { ParentAudience, SchoolLevel } from "../config/koreaRegions";
import type { MasterOutlineBlock, TargetGrade } from "./briefingMaterialTypes";
import type { RegionCard } from "./briefingRegionProfiles";

type OutlineAxis = {
  schoolLevel: SchoolLevel;
  targetGrade: TargetGrade;
  parentAudience: ParentAudience;
  regionCard: RegionCard;
  topicTitle: string;
  dataAsOf: string;
};

function block(
  blockId: string,
  title: string,
  purpose: string,
  bulletPoints: string[],
  extras?: Partial<MasterOutlineBlock>,
): MasterOutlineBlock {
  return {
    blockId,
    title,
    purpose,
    bulletPoints,
    dataGradesUsed: extras?.dataGradesUsed ?? ["A"],
    instructorInsightSlots: extras?.instructorInsightSlots,
    sources: extras?.sources,
  };
}

/** 지역×대상×목적에 따른 마스터 아웃라인 블록 골격 (조립형) */
export function buildOutlineSkeleton(axis: OutlineAxis): MasterOutlineBlock[] {
  const { schoolLevel, targetGrade, parentAudience, regionCard, topicTitle, dataAsOf } = axis;
  const regionLabel = regionCard.label;
  const isRecruit = parentAudience === "신입 모집";
  const isElem = schoolLevel === "초등";
  const isMiddle = schoolLevel === "중등";

  const cover = block(
    "cover",
    topicTitle,
    `${regionLabel} · ${targetGrade} 학부모 설명회`,
    [
      `대상: ${targetGrade} 학부모`,
      `목적: ${isRecruit ? "신규 모집·문제 인식·상담 연결" : "재원생 성과 정리·승급·유지"}`,
      `지역 자료 기준 시점: ${dataAsOf}`,
    ],
    { dataGradesUsed: ["A", "C"] },
  );

  const howToRead = block(
    "how_to_read",
    "이 자료를 읽는 법",
    "근거 등급과 해석 원칙 안내",
    [
      "A등급(학교알리미·교육청·KESS): 수치·정책의 1차 근거",
      "B등급(학교 홈페이지): 평가·학사 운영의 2차 근거",
      "C등급(한우리 메시지): 상담 연결용, 단독 근거 금지",
      "D등급(언론·블로그): 트렌드 참고만, 단정·서열 표현 금지",
    ],
    { dataGradesUsed: ["A", "C"] },
  );

  const localContext = block(
    "local_context",
    "지역 학습·진학 환경",
    "행정·학군 구조와 공공 인프라",
    [
      ...regionCard.localIssues.slice(0, 3),
      `중학군 프레임: ${regionCard.middleSchoolDistricts.join(", ")}`,
      `지자체 프로그램: ${regionCard.publicPrograms.slice(0, 2).join(", ")}`,
    ],
    {
      dataGradesUsed: ["A", "B"],
      instructorInsightSlots: [
        "학교별 실제 선호도·체감 분위기 변화",
        "학부모가 특정 학교에 과몰입하는 패턴",
      ],
      sources: regionCard.dataSources.filter((s) => s.grade === "A").map((s) => s.name),
    },
  );

  const targetFocus = isElem
    ? block(
        "target_focus",
        `${targetGrade} 핵심 이슈 — 과정 중심`,
        "입시 자극보다 습관·문해력·발표력",
        [
          "과정 중심 평가: 발표·토의·서술형·자료 해석",
          "학교 평가계획서 기준으로 준비 포인트 정리",
          "문해력·발표력·자기주도 학습 습관 강조",
        ],
        {
          dataGradesUsed: ["A", "B"],
          instructorInsightSlots: ["수행평가 공지 방식의 학교별 체감 차이"],
        },
      )
    : isMiddle
      ? block(
          "target_focus",
          `${targetGrade} 핵심 이슈 — 결과·로드맵`,
          "내신·지필·고교 선택·학점제",
          [
            "지필평가·내신 반영 규칙 이해",
            "고교 선택 기준·학군 배정 방식",
            "고교학점제 이슈와 준비 방향",
          ],
          { dataGradesUsed: ["A", "B"] },
        )
      : block(
          "target_focus",
          `${targetGrade} 핵심 이슈 — 입시·학습 전략`,
          "대입 정보·학습 설계",
          ["대입 정책 변화 요약", "학년별 필수 역량", "공식 포털 활용법"],
          { dataGradesUsed: ["A"] },
        );

  const schoolCompare = block(
    "school_compare",
    "학교별 특색 비교 프레임",
    "서열이 아닌 비교 기준 제시",
    [
      "비교 기준: 교육과정·평가 방식·특목·진로 프로그램",
      "수치는 학교알리미·공시 자료 인용 시에만",
      "‘○○교가 무조건 유리’ 표현 금지 → 선택 질문으로 전환",
    ],
    {
      dataGradesUsed: ["A", "B"],
      instructorInsightSlots: ["학교별 실제 체감 분위기·학부모 선택 행동"],
    },
  );

  const qa = block(
    "parent_qa",
    "학부모 질문 Q&A",
    "현장에서 자주 나오는 질문",
    isElem
      ? [
          "과정 평가에서 가정이 도울 수 있는 것은?",
          "선행 없이도 준비 가능한 영역은?",
          "중학군·학교 선택 전에 확인할 공식 자료는?",
        ]
      : [
          "내신·지필 비중은 학교마다 어떻게 다른가?",
          "고교 선택 시 공식적으로 확인할 항목은?",
          "학원·학습 설계는 언제부터 조정하는가?",
        ],
    { dataGradesUsed: ["B", "C"], instructorInsightSlots: ["상담실제 전환 질문 2~3개"] },
  );

  const checklist = block(
    "checklist",
    isElem ? "중학교 준비 체크리스트" : "다음 단계 학습 체크리스트",
    "가정·학생이 점검할 항목",
    isElem
      ? ["평가계획서 확인", "발표·토의 연습 루틴", "공식 포털 북마크", "상담 질문 리스트 작성"]
      : ["내신·지필 일정 정리", "목표 고교 정보 수집", "공백 리스크 점검", "상담 예약"],
    { dataGradesUsed: ["A", "B"] },
  );

  const brand = block(
    "brand_solution",
    "한우리 솔루션 연결",
    isRecruit ? "문제 인식 후 상담 CTA" : "성과 정리 후 승급·유지",
    isRecruit
      ? [
          "로컬 이슈와 연결된 학년별 프로그램 소개",
          "과정/결과 평가 대응 학습 설계",
          "개별 상담·진단으로 이어지는 다음 단계",
        ]
      : [
          "현재 성과 요약 프레임",
          "다음 학년 공백·리스크 설명",
          "재등록·승급 상담 일정 안내",
        ],
    { dataGradesUsed: ["C"], instructorInsightSlots: ["지부 성공 사례 1건(수치 과장 금지)"] },
  );

  const sources = block(
    "sources",
    "참고 자료 및 출처",
    "기준 시점·근거 목록",
    [
      `지역 자료 기준 시점: ${dataAsOf}`,
      ...regionCard.dataSources.slice(0, 5).map((s) => `[${s.grade}] ${s.name}`),
    ],
    { dataGradesUsed: ["A", "B", "C"] },
  );

  const cta = block(
    "cta",
    "마무리 · 상담 안내",
    "CTA",
    isRecruit
      ? ["설명회 후 1:1 상담 예약", "가져오면 좋은 자료(성적·평가계획)", "연락처·일정"]
      : ["승급·재등록 상담 일정", "다음 달 학습 목표 공유", "문의 채널"],
    { dataGradesUsed: ["C"] },
  );

  return [cover, howToRead, localContext, targetFocus, schoolCompare, qa, checklist, brand, sources, cta];
}

/** PPT용: 블록을 슬라이드 분량으로 압축할 때 우선 포함할 blockId */
export const PPT_PRIORITY_BLOCKS = [
  "cover",
  "local_context",
  "target_focus",
  "school_compare",
  "checklist",
  "brand_solution",
  "cta",
] as const;
