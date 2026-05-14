/** 로그인 아이디 기준 학생 영역 제목 (예: `teacher01님의 학생`). */
export function studentsSectionTitle(loginId: string | null | undefined): string {
  const id = loginId?.trim();
  return id ? `${id}선생님의 학생` : "학생";
}
