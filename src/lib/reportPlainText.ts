/**
 * AI가 반환한 본문을 리포트용 일반 텍스트로 정리합니다.
 * - 리터럴 `\\n` 등 이스케이프 시퀀스를 실제 줄바꿈으로
 * - 흔한 마크다운 장식(제목·굵게·코드) 제거
 */
export function stripAiPlainText(raw: string): string {
  let s = raw.trim();
  if (!s) return s;

  s = s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
  s = s.replace(/\\\\/g, "\\");

  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^\s*[-*]{3,}\s*$/gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\[([^\]]+)]\([^)]+\)/g, "$1");

  return s.replace(/\n{3,}/g, "\n\n").trim();
}
