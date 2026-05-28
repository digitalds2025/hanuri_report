/** 연간 「선생님의 따뜻한 한마디」섹션 — 로드맵+한마디 통합 본문 */

export function mergeWarmSectionFromSaved(
  roadmapText: string | null | undefined,
  teacherComment: string | null | undefined,
): string {
  const roadmap = (roadmapText ?? "").trim();
  const teacher = (teacherComment ?? "").trim();
  if (roadmap && teacher) {
    if (teacher.includes(roadmap.slice(0, 40))) return teacher;
    return `${roadmap}\n\n${teacher}`;
  }
  return roadmap || teacher;
}

export function joinWarmSectionParts(roadmap: string, teacherExpanded: string): string {
  const r = roadmap.trim();
  const t = teacherExpanded.trim();
  if (!r) return t;
  if (!t) return r;
  return `${r}\n\n${t}`;
}
