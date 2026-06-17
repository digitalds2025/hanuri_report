const MAX_BYTES = 12 * 1024 * 1024; // Gemini 인라인 한도 여유

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.5-flash";
}

function mimeForFile(file: File): string | null {
  const t = file.type?.trim();
  if (t) return t;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}

export function canGeminiExtractFile(file: File): boolean {
  const mime = mimeForFile(file);
  if (!mime) return false;
  return (
    mime === "application/pdf" ||
    mime.startsWith("image/")
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** PDF·이미지에서 본문 텍스트 추출 (Gemini 멀티모달) */
export async function extractDocumentTextWithGemini(file: File): Promise<string> {
  const key = getApiKey();
  if (!key) {
    throw new Error("VITE_GEMINI_API_KEY 가 없어 PDF·이미지 추출을 할 수 없습니다.");
  }
  const mime = mimeForFile(file);
  if (!mime || !canGeminiExtractFile(file)) {
    throw new Error("지원하지 않는 파일 형식입니다.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`파일이 너무 큽니다 (최대 ${Math.round(MAX_BYTES / 1024 / 1024)}MB).`);
  }

  const data = await fileToBase64(file);
  const model = getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `첨부된 문서(또는 이미지)에서 읽을 수 있는 모든 텍스트를 빠짐없이 추출하세요.
- 표·목록·제목·본문·각주·캡션을 포함합니다.
- OCR이 필요하면 수행합니다.
- 요약하지 말고 원문에 가깝게 출력합니다.
- 마크다운·코드블록 없이 일반 텍스트만 출력합니다.
- 읽을 수 있는 텍스트가 없으면 "(텍스트 없음)" 한 줄만 출력합니다.`,
            },
            {
              inline_data: {
                mime_type: mime,
                data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
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
    throw new Error(detail);
  }

  const parsed = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  if (parsed.promptFeedback?.blockReason) {
    throw new Error(`문서 처리 차단: ${parsed.promptFeedback.blockReason}`);
  }
  const text = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return text.trim() || "(텍스트 없음)";
}
