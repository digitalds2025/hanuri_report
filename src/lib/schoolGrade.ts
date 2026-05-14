/** DB·API에 저장되는 학년 코드 */
export const SCHOOL_GRADE_CODES = [
  "E1",
  "E2",
  "E3",
  "E4",
  "E5",
  "E6",
  "M1",
  "M2",
  "M3",
  "H1",
  "H2",
  "H3",
] as const;

export type SchoolGradeCode = (typeof SCHOOL_GRADE_CODES)[number];

export const SCHOOL_GRADE_OPTIONS: { value: SchoolGradeCode; label: string }[] = [
  { value: "E1", label: "초1" },
  { value: "E2", label: "초2" },
  { value: "E3", label: "초3" },
  { value: "E4", label: "초4" },
  { value: "E5", label: "초5" },
  { value: "E6", label: "초6" },
  { value: "M1", label: "중1" },
  { value: "M2", label: "중2" },
  { value: "M3", label: "중3" },
  { value: "H1", label: "고1" },
  { value: "H2", label: "고2" },
  { value: "H3", label: "고3" },
];

const LABEL_BY_CODE = Object.fromEntries(SCHOOL_GRADE_OPTIONS.map((o) => [o.value, o.label])) as Record<
  SchoolGradeCode,
  string
>;

export function isSchoolGradeCode(v: string): v is SchoolGradeCode {
  return (SCHOOL_GRADE_CODES as readonly string[]).includes(v);
}

/** 표시용: 초1, 중2 … / 알 수 없으면 입력 그대로 (공백만 제거) */
export function formatSchoolGradeLabel(code: string): string {
  const c = code.trim();
  if (!c) return "";
  const upper = c.toUpperCase();
  if (isSchoolGradeCode(upper)) return LABEL_BY_CODE[upper];
  return c;
}

/** 예전 1~12 숫자 학년 → 코드 (초1~6=1~6, 중1~3=7~9, 고1~3=10~12) */
export function mapLegacyNumericGradeToCode(n: number): SchoolGradeCode {
  if (n >= 1 && n <= 6) return `E${n}` as SchoolGradeCode;
  if (n >= 7 && n <= 9) return `M${n - 6}` as SchoolGradeCode;
  if (n >= 10 && n <= 12) return `H${n - 9}` as SchoolGradeCode;
  return "E1";
}
