/**
 * 학부모·보호자에게 전달되는 피드백 레포트(월간·분기·반기·연간) 본문용
 * 개인정보·식별 정보 제거 규칙.
 */

export type ReportPrivacyContext = {
  /** 학원 시스템 닉네임(실명일 수 있음) — 본문에서 제거 */
  studentNick?: string | null;
  studentId?: string | null;
  extraIdentifiers?: string[];
};

/** Gemini 프롬프트에 공통 삽입 */
export const REPORT_NO_PII_PROMPT_RULES = `## 개인정보·식별 정보 (절대 준수 — 위반 시 레포트 폐기)
- 본문은 **학부모·보호자에게 전달**됩니다. 다음을 **절대 출력하지 마세요**:
  - 학생 **실명·닉네임·이니셜**·「○○ 학생」「OO 학생」·「OO이/OO아는 …」 등 **이름·호칭으로 특정**하는 표현
  - **「김민수는 ~가 없다」**처럼 인명 + 판단·부정 문장
  - 학번·학생 ID·연락처·주소·생년월일·SNS·이메일 등 **개인을 특정할 수 있는 정보**
- 아이를 지칭할 때는 **「아이」「우리 아이」「이번 달 아이」** 등 **비식별 일반 호칭**만 사용하세요.
- 입력(교사 메모·월간 기록)에 이름이 있어도 **본문에 옮기지 말고** 일반화하세요.
- **학년·급**(예: 중2, 초4)만 언급 가능합니다.`;

const NICK_PARTICLE_SUFFIX =
  "(?:은|는|이|가|을|를|에게|께|께서|의|와|과|도|만|한테|에게서|로서|로써|이라|라고|이라는|라는)?";

/** 「○○ 학생」 등 플레이스홀더·이니셜 호칭 */
const PLACEHOLDER_STUDENT_RE =
  /(?:[○◯〇O0Ｏ]{1,4}|[가-힣]{1,2}[○◯〇O0]{1,3}|[○◯〇O0][가-힣]{1,2})\s*학생/g;

/** 알려진 닉네임이 없을 때 — 2~4글자 이름 + 학생 (중학생 등 제외) */
const GENERIC_NAME_STUDENT_RE = /([가-힣]{2,4})\s*학생/g;
const GENERIC_NAME_STUDENT_SKIP = new Set([
  "중학",
  "고등",
  "초등",
  "대학",
  "유학",
  "해당",
  "우리",
  "이번",
  "각",
  "모든",
  "한",
  "두",
  "세",
  "네",
  "다섯",
  "여섯",
  "일곱",
  "여덟",
  "아홉",
  "열",
]);

const PHONE_RE =
  /(?:\+?82[-.\s]?)?(?:0?1[016789]|0?2|0?3[1-3]|0?4[1-4]|0?5[0-5]|0?6[1-4])[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nickReplacementPatterns(nick: string): RegExp[] {
  const n = nick.trim();
  if (n.length < 1) return [];
  const e = escapeRegExp(n);
  return [
    new RegExp(`${e}\\s*학생`, "gi"),
    new RegExp(`「\\s*${e}\\s*」`, "g"),
    new RegExp(`'\\s*${e}\\s*'`, "g"),
    new RegExp(`"${e}"`, "g"),
    new RegExp(`${e}${NICK_PARTICLE_SUFFIX}`, "g"),
    new RegExp(`${e}(?=\\s)`, "g"),
  ];
}

function replaceNick(text: string, nick: string): string {
  let t = text;
  for (const re of nickReplacementPatterns(nick)) {
    t = t.replace(re, (match) => {
      if (/학생/i.test(match)) return "아이";
      if (/[은는이가을를]$/.test(match)) {
        const particle = match.match(/[은는이가을를]$/)?.[0] ?? "";
        return particle ? `아이${particle}` : "아이";
      }
      if (/에게|께|한테/.test(match)) return "아이에게";
      if (/의$/.test(match)) return "아이의";
      return "아이";
    });
  }
  return t;
}

function replaceGenericNameStudent(text: string): string {
  return text.replace(GENERIC_NAME_STUDENT_RE, (full, name: string) => {
    if (GENERIC_NAME_STUDENT_SKIP.has(name)) return full;
    return "아이";
  });
}

/**
 * 레포트 본문에서 학생 식별 정보를 제거·일반화합니다.
 */
export function sanitizeReportStudentPii(text: string, ctx?: ReportPrivacyContext): string {
  if (!text.trim()) return text;

  let t = text;

  const nicks = new Set<string>();
  const nick = ctx?.studentNick?.trim();
  if (nick) nicks.add(nick);
  for (const extra of ctx?.extraIdentifiers ?? []) {
    const x = extra.trim();
    if (x) nicks.add(x);
  }

  for (const n of nicks) {
    t = replaceNick(t, n);
  }

  t = t.replace(PLACEHOLDER_STUDENT_RE, "아이");
  t = replaceGenericNameStudent(t);

  const sid = ctx?.studentId?.trim();
  if (sid) {
    const sidEsc = escapeRegExp(sid);
    t = t.replace(new RegExp(sidEsc, "gi"), "");
  }

  t = t.replace(PHONE_RE, "");
  t = t.replace(EMAIL_RE, "");
  t = t.replace(UUID_RE, "");

  t = t.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
  return t;
}

export function buildReportPrivacyContext(opts: {
  studentNick?: string | null;
  studentId?: string | null;
  extraIdentifiers?: string[];
}): ReportPrivacyContext {
  return {
    studentNick: opts.studentNick?.trim() || undefined,
    studentId: opts.studentId?.trim() || undefined,
    extraIdentifiers: opts.extraIdentifiers?.map((s) => s.trim()).filter(Boolean),
  };
}

export function sanitizeReportSources(
  sources: { heading: string; body: string }[],
  ctx?: ReportPrivacyContext,
): { heading: string; body: string }[] {
  if (!ctx) return sources;
  return sources.map((s) => ({
    heading: sanitizeReportStudentPii(s.heading, ctx),
    body: sanitizeReportStudentPii(s.body, ctx),
  }));
}

/** AI 생성 결과에 프라이버시 규칙 적용 */
export function applyReportPrivacy(text: string, ctx?: ReportPrivacyContext): string {
  return sanitizeReportStudentPii(text, ctx);
}
