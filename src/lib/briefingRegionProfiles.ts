import type { DataTrustGrade } from "./briefingMaterialTypes";

export type RegionDataSource = {
  grade: DataTrustGrade;
  name: string;
  url?: string;
};

export type RegionCard = {
  /** KOREA_REGIONS 세부 지역명과 매칭 */
  subRegionKeys: string[];
  label: string;
  middleSchoolDistricts: string[];
  highSchoolDistricts: string[];
  publicPrograms: string[];
  localIssues: string[];
  dataSources: RegionDataSource[];
};

const A_SOURCES: RegionDataSource[] = [
  { grade: "A", name: "학교알리미", url: "https://www.schoolinfo.go.kr" },
  { grade: "A", name: "교육통계서비스(KESS)", url: "https://kess.kedi.re.kr" },
  { grade: "A", name: "대입정보포털 어디가", url: "https://www.adiga.kr" },
];

const UIWANG: RegionCard = {
  subRegionKeys: ["의왕시", "의왕"],
  label: "경기 의왕시",
  middleSchoolDistricts: ["의왕 중학군", "백운 중학군", "부곡 중학군"],
  highSchoolDistricts: ["안양권학군(인접권 참고)", "의왕·군포·안양 연계 고교"],
  publicPrograms: ["의왕시 진로진학상담센터", "미래부모학교", "의왕시 교육지원 사업"],
  localIssues: [
    "초6 과정 중심 평가(발표·토의·서술형·자료 해석) 비중 확대",
    "중학군 배정 방식(의왕/백운/부곡)에 따른 학부모 선택 프레임",
    "학교별 평가계획서·학업성적관리규정 공개 시기 차이",
  ],
  dataSources: [
    ...A_SOURCES,
    { grade: "A", name: "경기도교육청 고입·입학전학 포털" },
    { grade: "B", name: "관내 초·중학교 홈페이지 공지(평가계획·학사일정)" },
    { grade: "C", name: "한우리 학년별 메시지·상담 전환 문구" },
  ],
};

const GENERIC: RegionCard = {
  subRegionKeys: ["*"],
  label: "일반 지역",
  middleSchoolDistricts: ["지역 교육청 고시 중학군 기준 확인 필요"],
  highSchoolDistricts: ["관할 고교학군·배정 방식은 교육청 공고 확인"],
  publicPrograms: ["시·군·구 진로진학상담센터", "교육청 학부모 지원 프로그램"],
  localIssues: [
    "학교별 평가계획 공개 시기",
    "과정/결과 중심 평가 비중 변화",
    "학부모 정보 격차(공식 자료 접근성)",
  ],
  dataSources: [...A_SOURCES, { grade: "B", name: "관내 학교 홈페이지 공개 자료" }],
};

const PROFILES: RegionCard[] = [UIWANG, GENERIC];

export function getRegionProfile(subRegion: string, region?: string): RegionCard {
  const key = subRegion.trim();
  const hit = PROFILES.find((p) => p.subRegionKeys.some((k) => k !== "*" && key.includes(k)));
  if (hit) return hit;
  if (region?.includes("경기") && key.includes("의왕")) return UIWANG;
  return { ...GENERIC, label: region ? `${region} ${subRegion}` : subRegion };
}

export function formatRegionContext(card: RegionCard): string {
  return [
    `[지역 카드] ${card.label}`,
    `중학군: ${card.middleSchoolDistricts.join(" · ")}`,
    `고교학군(참고): ${card.highSchoolDistricts.join(" · ")}`,
    `공공 프로그램: ${card.publicPrograms.join(", ")}`,
    `로컬 이슈: ${card.localIssues.join(" / ")}`,
    `공식 데이터 소스: ${card.dataSources.map((s) => `${s.grade}:${s.name}`).join(", ")}`,
  ].join("\n");
}
