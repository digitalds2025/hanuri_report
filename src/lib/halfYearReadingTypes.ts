import { pillarLabelsKo, type PillarKey } from "./reportAggregates";

function pillarComboLabel(a: PillarKey, b: PillarKey): string {
  return `${pillarLabelsKo[a]} + ${pillarLabelsKo[b]}`;
}

/** DB `type_logic_code` — 상위 2역량 조합 */
export type HalfYearTypeLogicCode = "RT" | "RD" | "RW" | "RG" | "TD" | "TW" | "TG" | "DW" | "DG" | "WG";

export type HalfYearReadingTypeDef = {
  code: HalfYearTypeLogicCode;
  pillars: readonly [PillarKey, PillarKey];
  comboLabel: string;
  typeName: string;
  description: string;
};

export const HALF_YEAR_READING_TYPES: HalfYearReadingTypeDef[] = [
  {
    code: "RT",
    pillars: ["reading", "thinking"],
    comboLabel: pillarComboLabel("reading", "thinking"),
    typeName: "깊이 읽는 사색가",
    description:
      "책을 단순히 읽는 것에서 그치지 않고, 맥락과 의미를 깊이 파고드는 힘이 있습니다.\n읽은 내용을 자신만의 언어로 재해석하며 독자적인 사고 세계를 만들어가고 있습니다.",
  },
  {
    code: "RD",
    pillars: ["reading", "discussion"],
    comboLabel: pillarComboLabel("reading", "discussion"),
    typeName: "공감하는 이야기꾼",
    description:
      "책 속 인물과 상황에 깊이 공감하고, 그 감동을 말로 생생하게 풀어내는 능력이 뛰어납니다.\n이야기를 내 것으로 만들어 타인과 나누는 따뜻한 소통가입니다.",
  },
  {
    code: "RW",
    pillars: ["reading", "writing"],
    comboLabel: pillarComboLabel("reading", "writing"),
    typeName: "몰입하는 기록자",
    description:
      "읽은 내용을 그냥 흘려보내지 않고 글로 담아내며 생각을 완성해가는 타입입니다.\n독서와 글쓰기가 하나로 이어지는 탄탄한 학습 습관을 갖추고 있습니다.",
  },
  {
    code: "RG",
    pillars: ["reading", "growth"],
    comboLabel: pillarComboLabel("reading", "growth"),
    typeName: "성장을 즐기는 탐험가",
    description:
      "책 한 권 한 권을 새로운 세계로 받아들이며 스스로 배움을 찾아가는 힘이 있습니다.\n독서를 통해 세상을 넓혀가는 즐거움을 알고 있는 아이입니다.",
  },
  {
    code: "TD",
    pillars: ["thinking", "discussion"],
    comboLabel: pillarComboLabel("thinking", "discussion"),
    typeName: "전략적 토론가",
    description:
      "자신의 생각을 논리적으로 정리하고, 상대방의 의견도 귀 기울여 듣는 균형 잡힌 대화 능력을 갖추고 있습니다.\n토론 속에서 가장 빛나는 유형입니다.",
  },
  {
    code: "TW",
    pillars: ["thinking", "writing"],
    comboLabel: pillarComboLabel("thinking", "writing"),
    typeName: "분석하는 작가",
    description:
      "복잡한 생각도 체계적으로 정리해 완성도 높은 글로 표현해내는 능력이 돋보입니다.\n논리와 문장력이 함께 성장하고 있는 균형 잡힌 학습자입니다.",
  },
  {
    code: "TG",
    pillars: ["thinking", "growth"],
    comboLabel: pillarComboLabel("thinking", "growth"),
    typeName: "질문하는 사고가",
    description:
      "배운 것에 멈추지 않고 끊임없이 '왜?'를 던지며 스스로 깊이를 더해가는 탐구형입니다.\n주도적인 배움의 태도가 앞으로의 성장을 더욱 기대하게 합니다.",
  },
  {
    code: "DW",
    pillars: ["discussion", "writing"],
    comboLabel: pillarComboLabel("discussion", "writing"),
    typeName: "표현하는 완성가",
    description:
      "풍부한 어휘와 대화 속에서 다듬어진 언어 감각을 글쓰기로 아름답게 완성해냅니다.\n말과 글이 함께 성장하는 표현력의 완성형입니다.",
  },
  {
    code: "DG",
    pillars: ["discussion", "growth"],
    comboLabel: pillarComboLabel("discussion", "growth"),
    typeName: "열정적 참여자",
    description:
      "수업 안에서 누구보다 활발하게 참여하며 주변에 긍정적인 에너지를 전달하는 타입입니다.\n말과 태도로 수업 분위기를 이끄는 타고난 소통가입니다.",
  },
  {
    code: "WG",
    pillars: ["writing", "growth"],
    comboLabel: pillarComboLabel("writing", "growth"),
    typeName: "끈기 있는 성장러",
    description:
      "어렵더라도 끝까지 포기하지 않고 완성해내는 힘이 이 아이의 가장 큰 무기입니다.\n꾸준히 자신의 속도로 성장해가는 믿음직한 학습자입니다.",
  },
];

function pairKey(a: PillarKey, b: PillarKey): string {
  return [a, b].sort().join("|");
}

const TYPE_BY_PAIR = new Map<string, HalfYearReadingTypeDef>(
  HALF_YEAR_READING_TYPES.map((t) => [pairKey(t.pillars[0], t.pillars[1]), t]),
);

/** 두 역량 점수가 나머지 3개보다 모두 높을 때 */
export function isDominantPair(
  a: PillarKey,
  b: PillarKey,
  avg: Record<PillarKey, number>,
): boolean {
  const va = avg[a] ?? 0;
  const vb = avg[b] ?? 0;
  if (va <= 0 || vb <= 0) return false;
  const floor = Math.min(va, vb);
  const others: PillarKey[] = ["reading", "thinking", "discussion", "writing", "growth"].filter(
    (k) => k !== a && k !== b,
  ) as PillarKey[];
  return others.every((k) => (avg[k] ?? 0) < floor);
}

export function sortPillarsByScore(avg: Record<PillarKey, number>): PillarKey[] {
  return [...(["reading", "thinking", "discussion", "writing", "growth"] as const)].sort((x, y) => {
    const d = (avg[y] ?? 0) - (avg[x] ?? 0);
    if (d !== 0) return d;
    return x.localeCompare(y);
  });
}

export function resolveHalfYearReadingType(avg: Record<PillarKey, number>): {
  type: HalfYearReadingTypeDef;
  topTwo: [PillarKey, PillarKey];
  matchedStrict: boolean;
} {
  const ranked = sortPillarsByScore(avg);
  const topTwo: [PillarKey, PillarKey] = [ranked[0]!, ranked[1]!];

  for (const t of HALF_YEAR_READING_TYPES) {
    if (isDominantPair(t.pillars[0], t.pillars[1], avg)) {
      return { type: t, topTwo: [t.pillars[0], t.pillars[1]], matchedStrict: true };
    }
  }

  const fallback = TYPE_BY_PAIR.get(pairKey(topTwo[0], topTwo[1]));
  if (fallback) return { type: fallback, topTwo, matchedStrict: false };
  return { type: HALF_YEAR_READING_TYPES[0]!, topTwo, matchedStrict: false };
}
