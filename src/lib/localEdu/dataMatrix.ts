import type { SearchKeywordBatch } from "../briefingSearchKeywords";
import {
  buildSearchKeywordBatches,
  educationOfficePolicyQueries,
  guessEducationOffice,
} from "../briefingSearchKeywords";
import type { LocalEduInput } from "./types";
import { CORE_TOPIC_OPTIONS, type CoreTopicId } from "./types";

export type DataCollectionPlan = {
  /** 스캔에 포함할 배치 id */
  includeBatchIds: SearchKeywordBatch["id"][];
  /** 배치별 추가 키워드 */
  queryAugments: Partial<Record<SearchKeywordBatch["id"], string[]>>;
  /** UI·프롬프트용 분기 설명 */
  matrixSummary: string;
  /** 대상 분기 라벨 */
  targetBranch: string;
  /** 목적 분기 라벨 */
  purposeBranch: string;
};

function topicExtraQueries(
  regionName: string,
  region: string,
  subRegion: string,
  topics: CoreTopicId[],
): string[] {
  const office = guessEducationOffice(region, subRegion);
  const q: string[] = [];
  for (const t of topics) {
    if (t === "school_info") {
      q.push(`${regionName} 학교알리미`, `${regionName} 관내 학교 목록`);
    }
    if (t === "admission_change") {
      q.push(`${office} 입시 제도 변화`, `${regionName} 고입 전형`);
    }
    if (t === "performance_literacy") {
      q.push(`${regionName} 수행평가`, `${regionName} 문해력 독서토론`);
    }
    if (t === "credit_system") {
      q.push(`${regionName} 고교학점제`, `${office} 고교학점제 안내`);
    }
    if (t === "local_policy") {
      q.push(...educationOfficePolicyQueries(region, subRegion));
    }
    if (t === "parent_faq") {
      q.push(`${regionName} 학부모 FAQ`, `${regionName} 진로진학 상담`);
    }
  }
  return [...new Set(q)];
}

/** 대상×목적에 따른 RAG 수집 분기 (스펙 매트릭스) */
export function getDataCollectionPlan(input: LocalEduInput): DataCollectionPlan {
  const regionName = input.subRegion || input.region;
  const isElem = input.schoolLevel === "초등";
  const isMiddle = input.schoolLevel === "중등";
  const isRecruit = input.parentAudience === "신입 모집";
  const topicLabels = input.coreTopics
    .map((id) => CORE_TOPIC_OPTIONS.find((o) => o.id === id)?.label)
    .filter(Boolean);

  const includeBatchIds: SearchKeywordBatch["id"][] = [
    "official_tier1",
    "district_structure",
    "local_infra",
    "official_tier2",
    "curriculum_evaluation",
  ];

  const queryAugments: DataCollectionPlan["queryAugments"] = {
    official_tier1: [],
    curriculum_evaluation: [],
    local_infra: [],
    district_structure: [],
  };

  let targetBranch: string;
  let purposeBranch: string;

  if (isElem) {
    targetBranch =
      "초등: 학교알리미·교과 평가계획·방과후/선택형·지자체 공공자원 UP · 고입/대입 통계 배치 제외";
    if (!includeBatchIds.includes("admission_stats")) {
      /* 초등은 admission_stats 미포함 */
    }
    queryAugments.curriculum_evaluation = [
      `${regionName} 초등학교 평가계획`,
      `${input.targetGrade} 과정중심평가`,
      `${regionName} 방과후학교 선택형`,
      `${regionName} 돌봄 교육`,
    ];
    queryAugments.district_structure = [
      `${regionName} 관내 중학교`,
      `${regionName} 중학군 배정`,
    ];
  } else if (isMiddle) {
    targetBranch =
      "중등: 교육청 고입·학군·어디가·KESS UP · 내신·지필·수행평가·학업성적관리규정 집중";
    includeBatchIds.push("admission_stats");
    queryAugments.curriculum_evaluation = [
      `${input.targetGrade} 지필평가`,
      `${input.targetGrade} 수행평가 비중`,
      `${regionName} 학업성적관리규정`,
    ];
    queryAugments.official_tier1 = [
      `${regionName} KESS 내신`,
      `${regionName} site:adiga.kr 고입`,
    ];
  } else {
    targetBranch = "고등: 대입 전형·KESS·어디가·입학처 전형결과 집중";
    includeBatchIds.push("admission_stats");
  }

  if (isRecruit) {
    purposeBranch =
      "신규 모집: 교육 정책 변화·학부모 불안 FAQ·지역 마케팅(진로센터) UP · 재원 로드맵 가중치 DOWN";
    queryAugments.local_infra = [
      `${regionName} 진로진학상담센터`,
      `${regionName} 미래부모학교`,
      `${regionName} 학부모 설명회`,
    ];
    queryAugments.official_tier2 = [`${guessEducationOffice(input.region, input.subRegion)} 설명회 PDF`];
  } else {
    purposeBranch =
      "재원생 관리: 다음 학년·승급 공백·커리큘럼 연계 UP · 신규 모집 CTA 문구 DOWN";
    queryAugments.curriculum_evaluation = [
      ...(queryAugments.curriculum_evaluation ?? []),
      `${input.targetGrade} 다음 학년 준비`,
      `한우리 ${input.targetGrade} 로드맵`,
    ];
  }

  const topicQueries = topicExtraQueries(
    regionName,
    input.region,
    input.subRegion,
    input.coreTopics.length ? input.coreTopics : ["school_info", "performance_literacy"],
  );
  queryAugments.local_infra = [...(queryAugments.local_infra ?? []), ...topicQueries.slice(0, 6)];

  const matrixSummary = [
    `[대상] ${targetBranch}`,
    `[목적] ${purposeBranch}`,
    topicLabels.length ? `[주제] ${topicLabels.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    includeBatchIds,
    queryAugments,
    matrixSummary,
    targetBranch,
    purposeBranch,
  };
}

export function buildBranchedScanBatches(
  input: LocalEduInput,
  discoveredSchools: string[],
  plan: DataCollectionPlan,
): SearchKeywordBatch[] {
  const regionName = input.subRegion || input.region;
  const all = buildSearchKeywordBatches({
    regionName,
    region: input.region,
    subRegion: input.subRegion,
    schoolLevel: input.schoolLevel,
    targetGrade: input.targetGrade,
    schoolNames: discoveredSchools,
    includeSchoolBatches: discoveredSchools.length > 0,
    discoveryMode: input.schoolLevel === "초등",
  });

  return all
    .filter((b) => plan.includeBatchIds.includes(b.id))
    .map((b) => ({
      ...b,
      queries: [
        ...b.queries,
        ...(plan.queryAugments[b.id] ?? []),
      ],
    }));
}
