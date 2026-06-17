import {
  applyReportPrivacy,
  REPORT_NO_PII_PROMPT_RULES,
  sanitizeReportStudentPii,
  type ReportPrivacyContext,
} from "./reportStudentPrivacy";

/** 분기 Best 글쓰기 짧은 설명(이미지 옆 카피) — 프롬프트 목표 상한 */
export const QUARTER_BEST_WRITING_COMMENT_TARGET_CHARS = 50;

/** finalize 전용: 값이 `{...}` 형태여도 마인드맵용 JSON 추출 로직을 타지 않고 줄바꿈만 정리 */
function normalizeFinalizeString(raw: string): string {
  return raw
    .trim()
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .trim();
}

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.5-flash";
}

async function geminiGenerateText(
  prompt: string,
  temperature: number,
  maxOutputTokens: number,
  opts?: { responseMimeType?: string },
): Promise<string> {
  const key = getApiKey();
  if (!key) {
    throw new Error("VITE_GEMINI_API_KEY 가 .env 에 설정되어 있지 않습니다.");
  }
  const model = getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const generationConfig: Record<string, unknown> = { temperature, maxOutputTokens };
  if (opts?.responseMimeType) {
    generationConfig.responseMimeType = opts.responseMimeType;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw;
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } };
      if (j.error?.message) detail = j.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(`Gemini API 오류 (${res.status}): ${detail}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Gemini 응답 JSON 파싱 실패");
  }

  const d = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  if (d.promptFeedback?.blockReason) {
    throw new Error(`프롬프트 차단: ${d.promptFeedback.blockReason}`);
  }

  const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Gemini가 빈 응답을 반환했습니다.");
  return trimmed;
}

function stripCodeFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

/** Gemini가 앞뒤에 잡담을 붙여도 첫 번째 완전한 `{ ... }` 블록을 잘라 JSON.parse 시도 */
function extractBalancedJsonObject(raw: string): string | null {
  const t = stripCodeFence(raw);
  const start = t.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  const end = t.lastIndexOf("}");
  if (end > start) return t.slice(start, end + 1);
  return null;
}

function stringField(j: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = j[k];
    if (typeof v === "string" && v.trim()) return normalizeFinalizeString(v);
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  const nested = j.output ?? j.result ?? j.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return stringField(nested as Record<string, unknown>, keys);
  }
  return "";
}

/** JSON에서 두 필드를 읽습니다. 비어 있어도 예외를 던지지 않습니다(상위에서 폴백). */
function parseFinalizeModelJson(raw: string): { bestWritingComment: string; teacherExpanded: string } | null {
  try {
    const slice = extractBalancedJsonObject(raw) ?? raw.trim();
    if (!slice.startsWith("{")) return null;
    const j = JSON.parse(slice) as Record<string, unknown>;
    const bw = stringField(j, [
      "bestWritingComment",
      "best_writing_comment",
      "bestWriting",
      "best_writing_cmt",
      "bestComment",
    ]);
    const te = stringField(j, [
      "teacherExpanded",
      "teacher_expanded",
      "teacher_ai_comment",
      "teacherExpandedMessage",
      "teacherMessage",
      "letter",
    ]);
    return { bestWritingComment: bw, teacherExpanded: te };
  } catch {
    return null;
  }
}

export type QuarterReportFinalizeInput = {
  /** 학년·급 표기만 (닉네임·실명 금지) */
  gradeLabel: string;
  quarterLabel: string;
  knowledgeMindmapComment: string;
  insightKeywords: [string, string, string];
  insightPositiveComment: string;
  teacherSeedMessage: string;
  privacy?: ReportPrivacyContext;
};

export type QuarterReportFinalizeResult = {
  bestWritingComment: string;
  teacherExpanded: string;
};

/** 레포트 본문용 — 공문·편지식 인사·호칭 서두 제거(모델이 어기는 경우 보정) */
function stripTeacherReportSalutations(s: string): string {
  let t = s.trim();
  for (let i = 0; i < 5; i++) {
    const before = t;
    t = t
      .replace(/^안녕하세요[!！.。…\s]*/i, "")
      .replace(/^안녕하십니까[!！.。…\s]*/i, "")
      .replace(/^반갑습니다[!！.。…\s]*/i, "")
      .replace(/^학부모님(?:께|에게|여러분)?[,\s，:：．.]*(?:\n|$)/im, "")
      .replace(/^존경하는\s*학부모님[^\n]*\n*/i, "")
      .replace(/^친애하는\s*학부모님[^\n]*\n*/i, "")
      .trim();
    if (t === before) break;
  }
  return t.trim();
}

/** AI가 비우거나 실패했을 때 — 동일 맥락으로 짧은 Best 코멘트·2문단 편지체 확장본 */
function buildFinalizeFallback(input: QuarterReportFinalizeInput): QuarterReportFinalizeResult {
  const [a, b, c] = input.insightKeywords.map((k) => k.trim()).filter(Boolean);
  const triple = [a, b, c].join(" · ");
  const mind = input.knowledgeMindmapComment.trim();
  const growth = input.insightPositiveComment.trim();
  const seed = input.teacherSeedMessage.trim();

  const target = QUARTER_BEST_WRITING_COMMENT_TARGET_CHARS;
  const line1 = "이번 분기 대표 글로, 아이의 마음이 담긴 한 편을 골랐습니다.";
  const line2 = triple
    ? `「${triple.split("·")[0]?.trim() ?? triple}」의 기운이 글에도 스며 있습니다.`
    : "성장의 태도가 글에도 잘 드러났습니다.";

  let bestWritingComment = `${line1}\n${line2}`;
  if (bestWritingComment.length > target) {
    bestWritingComment = line1.length <= target ? line1 : line1.slice(0, target - 1).trimEnd() + "…";
  }

  const p1Parts: string[] = [];
  if (mind) p1Parts.push(`지식·수업 타당성 측면에서 보면, ${mind}`);
  if (triple) p1Parts.push(`성장 인사이트로 짚은 「${triple}」의 모습이 교실에서도 일관되게 보였습니다.`);
  if (growth) p1Parts.push(growth);
  if (seed) p1Parts.push(`선생님께서 남겨 주신 말씀 — 「${seed}」 — 도 함께 새겨 두었습니다.`);
  let paragraph1 = p1Parts.join(" ").replace(/\s+/g, " ").trim();
  if (paragraph1.length > 320) paragraph1 = paragraph1.slice(0, 317).trimEnd() + "…";
  if (paragraph1.length < 80) {
    paragraph1 = `${paragraph1} 아이만의 속도와 방식을 존중하며 지켜보고 있습니다.`.trim();
  }

  const paragraph2 =
    "저는 아이의 이 귀한 속도를 존중하며, 조급해하지 않고 스스로 성취감을 느낄 수 있도록 곁에서 든든한 페이스메이커가 되어 주려 합니다. 다음 차시·다음 분기 수업에서도 본인만의 호흡으로 한 걸음 더 나아갈 수 있도록, 지치지 않게 격려하고 꼼꼼히 지도하겠습니다.";

  const teacherExpanded = stripTeacherReportSalutations(`${paragraph1}\n\n${paragraph2}`);
  return { bestWritingComment: bestWritingComment.trim(), teacherExpanded: teacherExpanded.trim() };
}

function isBestWritingCommentValid(text: string): boolean {
  const t = text.trim();
  if (t.length < 10) return false;
  if (!/[가-힣]/.test(t)) return false;
  return true;
}

function parseBestWritingLinesJson(raw: string): string {
  const slice = extractBalancedJsonObject(raw) ?? raw.trim();
  if (!slice.startsWith("{")) return "";
  try {
    const j = JSON.parse(slice) as Record<string, unknown>;
    const l1 = typeof j.line1 === "string" ? j.line1.trim() : "";
    const l2 = typeof j.line2 === "string" ? j.line2.trim() : "";
    if (l1 && l2) return `${l1}\n${l2}`;
    if (l1) return l1;
    return stringField(j, ["bestWritingComment", "comment", "text"]);
  } catch {
    return "";
  }
}

/** 통합 JSON에서 bestWritingComment가 비었을 때 — 짧은 카피만 재생성 */
async function generateBestWritingCommentDedicated(
  gradeLabel: string,
  quarterLabel: string,
  contextBlock: string,
  bestTarget: number,
): Promise<string> {
  const prompt = `당신은 초·중·고 독서·국어 교육 현장의 전문 교사입니다.

${REPORT_NO_PII_PROMPT_RULES}

## 맥락
- 학년·급: **${gradeLabel}**
- 분기: **${quarterLabel}**

${contextBlock}

## 출력 (반드시 준수)
- **유효한 JSON 한 개만**: \`line1\`, \`line2\` (영문 키)
- 각 값은 한 문장, 마침표로 끝낼 것
- line1+line2 합쳐 **${bestTarget}자 이내**, 완결된 글만. 빈 문자열 금지`;

  let raw: string;
  try {
    raw = await geminiGenerateText(prompt, 0.35, 1024, { responseMimeType: "application/json" });
  } catch {
    raw = await geminiGenerateText(prompt, 0.35, 1024);
  }
  return parseBestWritingLinesJson(raw).trim();
}

/**
 * 분기 마지막 단계 전 — Best 글 짧은 코멘트 + 선생님 한마디 확장본을 한 번에 생성합니다.
 * (마인드맵 텍스트·성장 인사이트·초안 한마디를 모두 반영; 응답이 비면 로컬 폴백으로 채웁니다.)
 */
export async function generateQuarterReportFinalize(input: QuarterReportFinalizeInput): Promise<QuarterReportFinalizeResult> {
  const privacy = input.privacy;
  const [k1, k2, k3] = input.insightKeywords;
  const block = sanitizeReportStudentPii(
    [
      "## 지식·수업 타당성(마인드맵 생성 텍스트)",
      input.knowledgeMindmapComment.trim() || "(없음)",
      "",
      "## 성장 인사이트 — 핵심 태도·자세·모습 (3가지)",
      [k1, k2, k3].filter(Boolean).join(" · ") || "(없음)",
      "",
      "## 성장 인사이트 — 긍정적 행동 패턴에 대한 코멘트",
      input.insightPositiveComment.trim() || "(없음)",
      "",
      "## 선생님이 적은 따뜻한 한마디 (초안)",
      input.teacherSeedMessage.trim(),
    ].join("\n"),
    privacy,
  );

  const gradeLabel = input.gradeLabel.trim() || "해당 학년";
  const bestTarget = QUARTER_BEST_WRITING_COMMENT_TARGET_CHARS;

  const prompt = `당신은 초·중·고 독서·국어 교육 현장의 전문 교사입니다. 학부모에게 전달하는 한국어 문장만 씁니다.

${REPORT_NO_PII_PROMPT_RULES}

## 맥락
- 학년·급(식별용): **${gradeLabel}** — 본문에도 **학년·급만** 쓰고 이름·닉네임은 쓰지 마세요.
- 분기(또는 기간 표기): **${input.quarterLabel}**

${block}

## 출력 형식 (반드시 준수)
- **유효한 JSON 객체 한 개만** 출력하세요. 앞뒤 설명·마크다운·코드펜스·주석 금지.
- 키 이름은 **반드시 영문 그대로** 두 개만 사용: \`bestWritingComment\`, \`teacherExpanded\`. (다른 키·한글 키 금지)

## 필드 1: bestWritingComment
- 위 맥락의 **요지**를 은근히 녹여, 대표 **글쓰기 이미지** 옆에 붙이는 **아주 짧은 카피**처럼 씁니다.
- **문장 1~2개**, 필요 시 줄바꿈 \\n 한 번(문장마다 한 줄).
- 처음부터 **${bestTarget}자 이내**(공백 포함)로 **완결된 글**만 쓰세요. 길어지면 문장을 줄이고, 중간에서 끊기지 마세요.
- 첫 문장: 「이번 분기 대표 글을 골랐다」는 뉘앙스. 둘째 문장(있을 때): **성장·태도** 한 줄 칭찬.
- 과장·나열·책 제목 나열 금지. 빈 문자열 금지.

## 필드 2: teacherExpanded (선생님의 따뜻한 한마디 — **레포트 본문**)
- 위 **지식 마인드맵**, **성장 인사이트(3가지 + 긍정 패턴 코멘트)**, **따뜻한 한마디 초안**을 **모두 반영**해, 학부모가 읽는 **레포트 안의 한 블록**처럼 씁니다.
- **정확히 2개 문단**만. 문단 사이는 \\n\\n 한 번. 제목·머리말·글머리표 없음.
- **절대 금지**: 「학부모님(께/에게)」「안녕하세요」「안녕하십니까」「존경하는」「편지를 받으시면」「말씀드리」 등 **인사·서두·편지 형식**으로 시작하는 문장. **바로 관찰·격려 본문**부터 시작하세요. (예: 우리 아이는… / 교실에서 보이는 … 처럼 본론으로 시작)
- 1문단: **1~2문장**. 아이의 **성품·태도·잠재력**을 구체적으로 짚고, 부족해 보일 수 있는 면도 **긍정적으로 재해석**(예: 느림 → 납득할 때까지 파고드는 끈기). **이름 없이** 이 아이에게 해당하는 듯한 표현·은유를 허용합니다.
- 2문단: **1~2문장**. 교사 **1인칭(저는 …)**으로, 아이의 속도를 **존중**하고 **곁에서 지지**하겠다는 태도, **다음 차시·다음 분기** 격려로 마무리합니다. (과한 공문체·나열 금지)
- 톤·길이: 첨부 예시와 비슷한 **따뜻함·호흡** — **전체 약 260~420자**(짧은 2문단, 총 문장 수 대략 3~5개 수준). 초안의 감정선을 유지하되 장황하게 늘리지 마세요. 빈 문자열 금지.

검증: JSON 직렬화 후에도 두 필드 모두 내용이 있어야 합니다.`;

  const fb = buildFinalizeFallback(input);

  let raw: string;
  try {
    raw = await geminiGenerateText(prompt, 0.38, 2048, { responseMimeType: "application/json" });
  } catch {
    raw = await geminiGenerateText(prompt, 0.38, 2048);
  }

  const parsed = parseFinalizeModelJson(raw);
  let bestWritingComment = applyReportPrivacy(
    (parsed?.bestWritingComment?.trim() || "").trim(),
    privacy,
  );
  const teacherExpanded = applyReportPrivacy(
    stripTeacherReportSalutations(
      (parsed?.teacherExpanded?.trim() || fb.teacherExpanded).trim(),
    ),
    privacy,
  );

  if (!isBestWritingCommentValid(bestWritingComment)) {
    bestWritingComment = applyReportPrivacy(fb.bestWritingComment, privacy);
  }
  if (!isBestWritingCommentValid(bestWritingComment)) {
    const dedicated = await generateBestWritingCommentDedicated(
      gradeLabel,
      input.quarterLabel,
      block,
      bestTarget,
    );
    if (dedicated.trim()) {
      bestWritingComment = applyReportPrivacy(dedicated.trim(), privacy);
    }
  }
  if (!isBestWritingCommentValid(bestWritingComment)) {
    bestWritingComment = applyReportPrivacy(fb.bestWritingComment, privacy);
  }

  return { bestWritingComment, teacherExpanded };
}
