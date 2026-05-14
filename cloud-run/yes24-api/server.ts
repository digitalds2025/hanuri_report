/**
 * YES24 검색 API — Cloud Run 등 Node 서버에서 실행.
 * 루트의 yes24BookScrape.ts 는 `../../yes24BookScrape.ts` 로 import (Dockerfile 에서 동일 디렉터리 구조 유지).
 */
import cors from "cors";
import express from "express";
import { searchYes24AndAnalyze } from "../../yes24BookScrape.ts";

const PORT = Number(process.env.PORT) || 8080;
const apiSecret = (process.env.YES24_API_SECRET ?? "").trim();
const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
const geminiModel = (process.env.GEMINI_MODEL ?? "gemini-2.0-flash").trim();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** 비어 있으면 모든 Origin 허용(빠른 테스트용). 운영에서는 반드시 GitHub Pages Origin 을 지정하세요. */
const corsOrigin: cors.CorsOptions["origin"] =
  allowedOrigins.length === 0
    ? true
    : allowedOrigins.includes("*")
      ? true
      : allowedOrigins;

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "X-Api-Key", "Authorization"],
  }),
);

app.get("/health", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

function clientSecret(req: express.Request): string {
  const x = (req.get("X-Api-Key") ?? "").trim();
  if (x) return x;
  const auth = req.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m?.[1]?.trim() ?? "";
}

app.post("/api/local/books/yes24-search", async (req, res) => {
  if (!apiSecret) {
    res.status(500).json({ error: "서버에 YES24_API_SECRET 이 설정되지 않았습니다." });
    return;
  }
  if (clientSecret(req) !== apiSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!geminiKey) {
    res.status(500).json({ error: "서버에 GEMINI_API_KEY 가 필요합니다." });
    return;
  }

  const body = req.body as {
    title?: string;
    author?: string;
    publisher?: string;
    streamLogs?: boolean;
  };
  const title = String(body.title ?? "").trim();
  const author = String(body.author ?? "").trim();
  const publisher = String(body.publisher ?? "").trim();
  if (!title || !author || !publisher) {
    res.status(400).json({ error: "도서명, 저자/역자, 출판사를 모두 입력해 주세요." });
    return;
  }

  const streamLogs = Boolean(body.streamLogs);

  try {
    if (streamLogs) {
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      });
      const emit = (obj: unknown) => {
        res.write(`${JSON.stringify(obj)}\n`);
      };
      try {
        const result = await searchYes24AndAnalyze(
          { title, author, publisher },
          { apiKey: geminiKey, model: geminiModel },
          {
            onLog: (message) => emit({ kind: "log", message }),
            headed: false,
          },
        );
        emit({ kind: "done", result });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        emit({ kind: "error", message });
      }
      res.end();
      return;
    }

    const result = await searchYes24AndAnalyze(
      { title, author, publisher },
      { apiKey: geminiKey, model: geminiModel },
      { headed: false },
    );
    res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`yes24-api listening on ${PORT}`);
});
