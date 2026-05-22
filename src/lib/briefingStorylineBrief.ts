import type {
  BriefingMaterialFormInput,
  BriefingStorylineBrief,
  BriefingTopicCandidate,
  StoryPhase,
  StorylinePhaseBrief,
} from "./briefingMaterialTypes";
import { purposeLabel } from "./geminiBriefingKit";
import { geminiGenerateJson, type GeminiTokenUsage } from "./geminiClient";

const DEFAULT_PHASES: Omit<StorylinePhaseBrief, "slideCount" | "narrative" | "keyActions">[] = [
  {
    phase: "intro",
    label: "도입부: 문제 제기",
    parentEmotion: "불안",
    designTone: "어두운 톤·강렬 타이포·텍스트 밀도 낮음",
  },
  {
    phase: "development",
    label: "전개부: 객관적 분석",
    parentEmotion: "수긍/이해",
    designTone: "표·그래프·공식 데이터 밀도 최고",
  },
  {
    phase: "climax",
    label: "절정부: 해결책 제시",
    parentEmotion: "안도/신뢰",
    designTone: "브랜드 컬러·깔끔한 솔루션 레이아웃",
  },
  {
    phase: "closing",
    label: "종결부: 행동 유도",
    parentEmotion: "행동/상담",
    designTone: "CTA·상담 예약·명확한 다음 단계",
  },
];

function allocateSlideCounts(total: number): Record<StoryPhase, number> {
  let intro = Math.max(2, Math.round(total * 0.15));
  let development = Math.max(4, Math.round(total * 0.5));
  let climax = Math.max(2, Math.round(total * 0.2));
  let closing = Math.max(2, total - intro - development - climax);
  if (intro + development + climax + closing !== total) {
    development = total - intro - climax - closing;
  }
  if (development < 3) {
    development = 3;
    closing = Math.max(2, total - intro - development - climax);
  }
  return { intro, development, climax, closing };
}

function fallbackStoryline(
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
  totalSlides: number,
): BriefingStorylineBrief {
  const counts = allocateSlideCounts(totalSlides);
  const purpose = purposeLabel(input.parentAudience);
  const isRecruit = input.parentAudience === "신입 모집";

  const narratives: Record<StoryPhase, { narrative: string; keyActions: string[] }> = {
    intro: {
      narrative: isRecruit
        ? `${input.subRegion} ${input.targetGrade} 학부모가 체감하는 평가·진로 변화를 문제 프레임으로 제시. '${topic.title}' 주제로 불안을 공감하되 단정·서열은 피합니다.`
        : `재원생 학부모에게 다음 학년 공백·리스크를 조용히 각인. '${topic.title}'로 성과 정리 전에 왜 지금 점검이 필요한지 설명합니다.`,
      keyActions: ["정책·평가 변화 키워드 1개", "학부모 공감 질문", "기준 시점 안내"],
    },
    development: {
      narrative: `학교알리미·교육청 등 A등급 fact만으로 '${topic.title}'을 데이터로 풀어줍니다. 표·빅넘버·비교 슬라이드로 이성적 신뢰를 쌓습니다.`,
      keyActions: ["관내 학교/정책 fact 인용", "수치·표 슬라이드", "비교 기준 명시"],
    },
    climax: {
      narrative: `한우리 독서·토론·논술 솔루션을 '${topic.title}'과 연결. 과정/결과 평가 대응 학습 설계를 안도감 있게 제시합니다.`,
      keyActions: ["프로그램 3청크", "강사 인사이트 슬롯", "지역 맞춤 사례"],
    },
    closing: {
      narrative: isRecruit
        ? "1:1 상담·진단 예약 CTA. 가져올 자료와 연락 채널을 명확히 안내합니다."
        : "승급·재등록 상담 일정 CTA. 다음 달 학습 목표 공유로 행동을 유도합니다.",
      keyActions: ["상담 예약 CTA", "준비물 체크", "카카오/문자 후속 안내"],
    },
  };

  const phases: StorylinePhaseBrief[] = DEFAULT_PHASES.map((p) => ({
    ...p,
    slideCount: counts[p.phase],
    narrative: narratives[p.phase].narrative,
    keyActions: narratives[p.phase].keyActions,
  }));

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    totalSlides,
    purposeLabel: purpose,
    targetLabel: `${input.schoolLevel} ${input.targetGrade}`,
    overview: `[${purpose}] '${topic.title}' — ${totalSlides}장 설명회. 도입(불안) → 전개(수긍) → 절정(신뢰) → 종결(상담) 감정 곡선으로 설계합니다. ${topic.summary}`,
    phases,
  };
}

const STORYLINE_BRIEF_SYSTEM = `설명회 전체 흐름(스토리라인) 기획. 주제·목적·타겟·요청 슬라이드 수에 맞춤.

4단계 감정 변호 (slideCount 합 = totalSlides):
1. intro 도입부: 문제 제기 — 학부모 불안, 밀도 낮음
2. development 전개부: 객관적 분석 — 수긍/이해, 데이터 밀도 최고
3. climax 절정부: 해결책 — 안도/신뢰, 브랜드 연결
4. closing 종결부: 행동 유도 — 상담/신청

JSON만:
{
  "overview": "2~4문장 전체 흐름",
  "phases": [{
    "phase": "intro|development|climax|closing",
    "label": "도입부: ...",
    "parentEmotion": "불안|수급/이해|안도/신뢰|행동/상담",
    "designTone": "디자인 톤 한 줄",
    "slideCount": number,
    "narrative": "이 단계에서 무엇을 말할지 2~3문장",
    "keyActions": ["액션1","액션2","액션3"]
  }]
}`;

export async function buildStorylineBriefForTopic(
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
  totalSlides: number,
): Promise<{ brief: BriefingStorylineBrief; usage: GeminiTokenUsage }> {
  const fb = fallbackStoryline(input, topic, totalSlides);
  const purpose = purposeLabel(input.parentAudience);

  const userPrompt = `지역: ${input.region} ${input.subRegion}
타겟: ${input.schoolLevel} ${input.targetGrade}
설명회 목적: ${purpose}${input.purposeCustom ? ` (${input.purposeCustom})` : ""}
선택 주제: ${topic.title}
주제 요약: ${topic.summary}
근거: ${topic.rationale}
**총 슬라이드 수: ${totalSlides}장** (4단계 slideCount 합계가 정확히 ${totalSlides})

수집 fact ${input.officialScan?.facts.length ?? 0}건. 목적·주제에 맞는 설명회 흐름을 기획하세요.`;

  try {
    const { data: parsed, usage } = await geminiGenerateJson<{
      overview?: string;
      phases?: unknown[];
    }>(STORYLINE_BRIEF_SYSTEM, userPrompt, 0.35, "writer", 8192);

    const rawPhases = Array.isArray(parsed.phases) ? parsed.phases : [];
    if (rawPhases.length < 4) throw new Error("스토리라인 단계 부족");

    const phases: StorylinePhaseBrief[] = rawPhases.slice(0, 4).map((item, i) => {
      const o = item as Record<string, unknown>;
      const def = fb.phases[i] ?? fb.phases[0];
      return {
        phase: (o.phase as StoryPhase) ?? def.phase,
        label: String(o.label ?? def.label),
        parentEmotion: String(o.parentEmotion ?? def.parentEmotion),
        designTone: String(o.designTone ?? def.designTone),
        slideCount: Number(o.slideCount) || def.slideCount,
        narrative: String(o.narrative ?? def.narrative),
        keyActions: Array.isArray(o.keyActions)
          ? o.keyActions.filter((x): x is string => typeof x === "string").slice(0, 5)
          : def.keyActions,
      };
    });

    let sum = phases.reduce((a, p) => a + p.slideCount, 0);
    if (sum !== totalSlides) {
      const diff = totalSlides - sum;
      const dev = phases.find((p) => p.phase === "development");
      if (dev) dev.slideCount += diff;
    }

    return {
      brief: {
        topicId: topic.id,
        topicTitle: topic.title,
        totalSlides,
        purposeLabel: purpose,
        targetLabel: `${input.schoolLevel} ${input.targetGrade}`,
        overview: String(parsed.overview ?? fb.overview),
        phases,
      },
      usage,
    };
  } catch (e) {
    console.warn("[buildStorylineBriefForTopic] 폴백", e);
    return { brief: fb, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

export { allocateSlideCounts, fallbackStoryline };
