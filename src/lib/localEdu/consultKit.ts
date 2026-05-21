import { geminiGenerateText } from "../geminiClient";
import type { MasterOutline } from "../briefingMaterialTypes";
import type { LocalEduInput } from "./types";
import { localEduTargetLabel } from "./types";

export async function buildConsultKit(
  input: LocalEduInput,
  outline: MasterOutline,
  corpusExcerpt: string,
): Promise<{
  onePageSummaryMd: string;
  questionListMd: string;
  kakaoMessageMd: string;
}> {
  const regionLabel = `${input.region} ${input.subRegion}`;
  const purpose =
    input.purposeCustom?.trim() ||
    (input.parentAudience === "신입 모집" ? "신규 모집" : "기존 재원생 관리");

  const prompt = `한우리 지부 설명회 상담 키트. JSON 없이 마크다운 3섹션만.

조건: ${regionLabel} · ${localEduTargetLabel(input)} · ${purpose}
주제: ${outline.topicTitle}
기준 시점: ${outline.dataAsOf}

[공식 리서치 발췌]
${corpusExcerpt.slice(0, 12000)}

출력 형식:
# 1페이지 상담 요약
(불릿 8개 이내)

# 상담 핵심 질문 리스트
(번호 8개)

# 후속 카카오톡/문자 안내문
(200자 내외, 존댓말)`;

  const text = await geminiGenerateText(prompt, 0.4, "writer", 8192);
  const sections = text.split(/^# /m).filter(Boolean);
  const onePage = sections.find((s) => s.includes("1페이지") || s.startsWith("1페이지"));
  const questions = sections.find((s) => s.includes("질문"));
  const kakao = sections.find((s) => s.includes("카카오") || s.includes("문자"));

  return {
    onePageSummaryMd: onePage ? `# ${onePage.trim()}` : text,
    questionListMd: questions ? `# ${questions.trim()}` : "# 상담 핵심 질문\n(생성 실패 — 수동 작성)",
    kakaoMessageMd: kakao ? `# ${kakao.trim()}` : "# 후속 안내문\n(생성 실패 — 수동 작성)",
  };
}
