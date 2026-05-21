import type { ParentAudience, SchoolLevel } from "../config/koreaRegions";
import type { TargetGrade } from "./briefingMaterialTypes";

export type SearchKeywordBatch = {
  id:
    | "official_tier1"
    | "official_tier2"
    | "district_structure"
    | "curriculum_evaluation"
    | "admission_stats"
    | "local_infra";
  label: string;
  queries: string[];
};

/** ① 반드시 우선 참고 — 공식 포털·통계 */
export function tier1OfficialQueries(
  region: string,
  subRegion: string,
  regionName: string,
): string[] {
  const office = guessEducationOffice(region, subRegion);
  return [
    `${regionName} site:schoolinfo.go.kr`,
    `${regionName} 학교알리미`,
    `${office} 고입안내`,
    `${office} 평준화 배정`,
    `${office} 비평준화 배정`,
    `${region} 입학전학포털`,
    `${regionName} 교육통계 site:kess.kedi.re.kr`,
    `KESS ${regionName} 학교`,
    `${regionName} site:adiga.kr`,
    `어디가 ${regionName} 고입`,
    `대학입학처 전년도 전형결과 ${region}`,
    `${office} 학교알리미`,
  ];
}

/** ② 공식 보완 자료 */
export function tier2OfficialQueries(
  region: string,
  subRegion: string,
  regionName: string,
): string[] {
  const office = guessEducationOffice(region, subRegion);
  const support = subRegion.endsWith("구") || subRegion.endsWith("시") || subRegion.endsWith("군")
    ? `${subRegion} 교육지원청`
    : office;
  return [
    `${support} 자료실`,
    `${office} 설명회 자료 PDF`,
    `${office} 설명회 자료`,
    `${regionName} 학교 홈페이지 평가계획`,
    `${regionName} 학교소개 교육과정`,
    `${regionName} 진학지도 자료`,
  ];
}

export function guessEducationOffice(region: string, subRegion: string): string {
  if (region === "서울") return "서울특별시교육청";
  if (region === "경기") return "경기도교육청";
  if (region === "부산") return "부산광역시교육청";
  if (region === "인천") return "인천광역시교육청";
  if (region === "대구") return "대구광역시교육청";
  if (region === "광주") return "광주광역시교육청";
  if (region === "대전") return "대전광역시교육청";
  if (region === "울산") return "울산광역시교육청";
  if (region === "세종") return "세종특별자치시교육청";
  if (subRegion.endsWith("시") || subRegion.endsWith("군") || subRegion.endsWith("구")) {
    return `${subRegion} 교육지원청`;
  }
  return `${region}교육청`;
}

/** ① 학군·학교 구조 — 지역명 기반 (학교명 없음) */
export function districtStructureQueries(regionName: string): string[] {
  return [
    `${regionName} 중학교 현황`,
    `${regionName} 고등학교 리스트`,
    `${regionName} 중학군 배정 방식`,
    `${regionName} 고교 학군`,
    `${regionName} 평준화 비평준화 배정`,
    `${regionName} 자율고`,
    `${regionName} 일반고 특색`,
    `${regionName} 초등학교 목록 site:schoolinfo.go.kr`,
  ];
}

/** ④ 지자체 교육 인프라 */
export function localInfraQueries(regionName: string): string[] {
  return [
    `${regionName} 진로진학상담센터`,
    `${regionName} 미래부모학교`,
    `${regionName} 교육지원 프로그램`,
  ];
}

/** ② 교육청·지원청 정책 (학교명 불필요) */
export function educationOfficePolicyQueries(region: string, subRegion: string): string[] {
  const office = guessEducationOffice(region, subRegion);
  return [
    `${office} 서논술형 평가`,
    `${office} 맞춤형 학업성취도평가`,
    `${office} 기초학력`,
  ];
}

/** ② 학교별 — 학년군 지정 시 */
export function curriculumQueriesForSchool(
  schoolName: string,
  schoolLevel: SchoolLevel,
): string[] {
  if (schoolLevel === "초등") {
    return [
      `${schoolName} 평가계획`,
      `${schoolName} 학년별 교육과정`,
      `${schoolName} 선택형 교육`,
      `${schoolName} 방과후학교 운영 계획`,
    ];
  }
  if (schoolLevel === "중등") {
    return [
      `${schoolName} 지필평가 일정`,
      `${schoolName} 수행평가 비중`,
      `${schoolName} 학업성적관리규정`,
    ];
  }
  return [
    `${schoolName} 교육과정 운영`,
    `${schoolName} 내신 산출`,
    `${schoolName} 대입 진로`,
  ];
}

/** ② 지역 스캔 시 — 관내 학교에 초·중·고 핵심 키워드 모두 시도 (학년 미정) */
export function curriculumQueriesDiscovery(schoolNames: string[], region: string, subRegion: string): string[] {
  const q = [...educationOfficePolicyQueries(region, subRegion)];
  const limit = Math.min(schoolNames.length, 12);
  for (let i = 0; i < limit; i++) {
    const s = schoolNames[i];
    q.push(
      `${s} 평가계획`,
      `${s} 학년별 교육과정`,
      `${s} 선택형 교육`,
      `${s} 방과후학교 운영 계획`,
      `${s} 지필평가 일정`,
      `${s} 수행평가 비중`,
      `${s} 학업성적관리규정`,
    );
  }
  return q;
}

export function curriculumQueries(
  schoolNames: string[],
  schoolLevel: SchoolLevel,
  educationOffice: string,
): string[] {
  const q = [
    `${educationOffice} 서논술형 평가`,
    `${educationOffice} 맞춤형 학업성취도평가`,
    `${educationOffice} 기초학력`,
  ];
  const limit = Math.min(schoolNames.length, 12);
  for (let i = 0; i < limit; i++) {
    q.push(...curriculumQueriesForSchool(schoolNames[i], schoolLevel));
  }
  return q;
}

/** ③ 진학률·고입·대입 */
export function admissionQueries(regionName: string, schoolNames: string[]): string[] {
  const q = [
    `${regionName} 고교별 대학 진학률`,
    `${regionName} 전형별 합격자 수`,
    `${regionName} 대입 합격 사례 분석`,
    `${regionName} 대입 합격 사례 site:adiga.kr`,
  ];
  const limit = Math.min(schoolNames.length, 12);
  for (let i = 0; i < limit; i++) {
    q.push(`${schoolNames[i]} 졸업생 진로 현황 site:schoolinfo.go.kr`);
  }
  return q;
}

/** UI·스캔 계획용 ①~④ 전체 키워드 풀 */
export function buildFullKeywordPool(params: {
  regionName: string;
  region: string;
  subRegion: string;
  schoolLevel?: SchoolLevel;
  schoolNames?: string[];
}): SearchKeywordBatch[] {
  const { regionName, region, subRegion, schoolNames = [] } = params;
  const sampleSchool = schoolNames[0] ?? `[${regionName} 관내 ○○초등학교]`;

  const curriculumPreview =
    schoolNames.length > 0
      ? curriculumQueriesDiscovery(schoolNames, region, subRegion)
      : [
          ...educationOfficePolicyQueries(region, subRegion),
          `${sampleSchool} 평가계획`,
          `${sampleSchool} 학년별 교육과정`,
          `${sampleSchool} 선택형 교육`,
          `${sampleSchool} 방과후학교 운영 계획`,
          `${sampleSchool} 지필평가 일정`,
          `${sampleSchool} 수행평가 비중`,
          `${sampleSchool} 학업성적관리규정`,
        ];

  const admissionPreview =
    schoolNames.length > 0
      ? admissionQueries(regionName, schoolNames)
      : [
          `${regionName} 고교별 대학 진학률`,
          `${regionName} 전형별 합격자 수`,
          `${sampleSchool} 졸업생 진로 현황 site:schoolinfo.go.kr`,
          `${regionName} 대입 합격 사례 site:adiga.kr`,
        ];

  return [
    {
      id: "official_tier1",
      label: "⓪ 반드시 우선 참고(공식 포털)",
      queries: tier1OfficialQueries(region, subRegion, regionName),
    },
    {
      id: "official_tier2",
      label: "⓪ 공식 보완(교육청·학교 홈)",
      queries: tier2OfficialQueries(region, subRegion, regionName),
    },
    { id: "district_structure", label: "① 학군·학교 구조", queries: districtStructureQueries(regionName) },
    {
      id: "curriculum_evaluation",
      label: "② 교육과정·평가 (교육청 + 학교별)",
      queries: curriculumPreview,
    },
    { id: "admission_stats", label: "③ 진학·입시 통계", queries: admissionPreview },
    { id: "local_infra", label: "④ 지자체 교육 인프라", queries: localInfraQueries(regionName) },
  ];
}

export function buildSearchKeywordBatches(params: {
  regionName: string;
  region: string;
  subRegion: string;
  schoolLevel: SchoolLevel;
  targetGrade: TargetGrade;
  schoolNames?: string[];
  /** true: ①→④→②→③ 순 전체 스캔 */
  includeSchoolBatches?: boolean;
  /** 학교 배치 시 discovery(전 학년군) vs 학년군 맞춤 */
  discoveryMode?: boolean;
}): SearchKeywordBatch[] {
  const {
    regionName,
    region,
    subRegion,
    schoolLevel,
    schoolNames = [],
    includeSchoolBatches = false,
    discoveryMode = true,
  } = params;
  const office = guessEducationOffice(region, subRegion);

  const batches: SearchKeywordBatch[] = [
    {
      id: "official_tier1",
      label: "⓪ 반드시 우선 참고(공식 포털)",
      queries: tier1OfficialQueries(region, subRegion, regionName),
    },
    {
      id: "district_structure",
      label: "① 학군·학교 구조",
      queries: districtStructureQueries(regionName),
    },
    {
      id: "local_infra",
      label: "④ 지자체 교육 인프라",
      queries: localInfraQueries(regionName),
    },
    {
      id: "official_tier2",
      label: "⓪ 공식 보완(교육청·학교 홈)",
      queries: tier2OfficialQueries(region, subRegion, regionName),
    },
  ];

  if (includeSchoolBatches && schoolNames.length > 0) {
    batches.push({
      id: "curriculum_evaluation",
      label: "② 교육과정·평가",
      queries: discoveryMode
        ? curriculumQueriesDiscovery(schoolNames, region, subRegion)
        : curriculumQueries(schoolNames, schoolLevel, office),
    });
    batches.push({
      id: "admission_stats",
      label: "③ 진학·입시 통계",
      queries: admissionQueries(regionName, schoolNames),
    });
  }

  return batches;
}

export function purposeBriefForScan(
  audience: ParentAudience,
  purposeCustom?: string,
): string {
  const custom = purposeCustom?.trim();
  if (custom) {
    return (
      `목적(직접 입력): ${custom}. 이 목적에 맞는 공식 근거·수치·학교명을 최대한 많이 수집. ` +
      "요약·생략 없이 출처 발췌까지 기록."
    );
  }
  if (audience === "신입 모집") {
    return (
      "목적: 신규 모집(Market Expansion). 지역 교육 이슈·평가 변화로 '문제 인식'과 " +
      "학습 방식 전환 필요성을 짚는 공식 근거를 우선 수집. 요약·생략 없이 전건 기록."
    );
  }
  return (
    "목적: 기존 재원생 관리(Retention). 현 학년 성과·다음 학년 공백 리스크를 설명할 " +
    "공식 근거를 우선 수집. 요약·생략 없이 전건 기록."
  );
}
