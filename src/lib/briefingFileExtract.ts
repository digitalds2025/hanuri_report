import { canGeminiExtractFile, extractDocumentTextWithGemini } from "./geminiExtractDocument";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json", ".html", ".htm"]);

function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  return lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
}

export type FileExtractProgress = {
  fileName: string;
  status: "reading" | "gemini" | "done" | "error";
};

/**
 * 첨부 파일 → 참고 자료 본문 문자열.
 * - txt/md/csv 등: 브라우저에서 파일 내용 그대로 읽기
 * - PDF·이미지: Gemini로 OCR/텍스트 추출
 * - ppt/doc 등: 본문 추출 없음(안내 문구만)
 */
export async function extractTextFromFiles(
  files: File[],
  onProgress?: (p: FileExtractProgress) => void,
): Promise<{ text: string; names: string[] }> {
  const names: string[] = [];
  const parts: string[] = [];

  for (const file of files) {
    names.push(file.name);
    const ext = extensionOf(file.name);

    if (TEXT_EXTENSIONS.has(ext)) {
      onProgress?.({ fileName: file.name, status: "reading" });
      try {
        const content = await file.text();
        parts.push(`--- ${file.name} ---\n${content.trim()}`);
        onProgress?.({ fileName: file.name, status: "done" });
      } catch {
        parts.push(`--- ${file.name} ---\n(텍스트 읽기 실패)`);
        onProgress?.({ fileName: file.name, status: "error" });
      }
      continue;
    }

    if (canGeminiExtractFile(file)) {
      onProgress?.({ fileName: file.name, status: "gemini" });
      try {
        const content = await extractDocumentTextWithGemini(file);
        parts.push(`--- ${file.name} ---\n${content}`);
        onProgress?.({ fileName: file.name, status: "done" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        parts.push(
          `--- ${file.name} ---\n(PDF/이미지 텍스트 추출 실패: ${msg}\n직접 붙여넣거나 txt로 저장 후 다시 올려 주세요.)`,
        );
        onProgress?.({ fileName: file.name, status: "error" });
      }
      continue;
    }

    parts.push(
      `--- ${file.name} ---\n` +
        `(이 형식(${ext || file.type || "알 수 없음"})은 자동 추출을 지원하지 않습니다. ` +
        `PDF·이미지(jpg/png)·txt/md는 추출됩니다. 내용을 아래 칸에 붙여넣어 주세요.)`,
    );
    onProgress?.({ fileName: file.name, status: "done" });
  }

  return { text: parts.join("\n\n"), names };
}
