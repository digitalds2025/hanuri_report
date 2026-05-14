/**
 * YES24 검색·상세 스크래핑 + Gemini로 ai_category / ai_keywords 추출.
 * Vite 개발 서버(local-db-dev-plugin)에서만 실행됩니다.
 *
 * Windows에서 `net::ERR_NETWORK_ACCESS_DENIED` 가 나오면:
 * - 채널을 지정하지 않은 경우 **설치된 Chrome → Edge → 내장 Chromium** 순으로 자동 재시도합니다.
 * - 개발 서버(`npm run dev`)에서는 기본 **창 표시(headed)**. 숨기려면 `YES24_FORCE_HEADLESS=1`.
 * - `YES24_PLAYWRIGHT_HEADED=1` 로도 창 표시(프리뷰 등).
 * - 내장만 쓰려면: `YES24_PLAYWRIGHT_CHANNEL=bundled`
 */
import { chromium, type LaunchOptions, type Page } from "playwright";

export type Yes24SearchInput = {
  title: string;
  author: string;
  publisher: string;
};

export type Yes24SearchResult = {
  title: string;
  author: string;
  publisher: string;
  url: string;
  cover_url: string | null;
  category: string | null;
  introduce: string | null;
  author_cmt: string | null;
  pub_cmt: string | null;
  ai_category: string | null;
  ai_keywords: string[];
};

export type Yes24SearchOptions = {
  /** 단계별 로그(스트리밍 API에서 실시간 전달) */
  onLog?: (message: string) => void;
  /**
   * true면 브라우저 창을 띄움(headless 아님). Vite 개발 서버에서 기본으로 true를 넘깁니다.
   * `YES24_FORCE_HEADLESS=1` 이면 무조건 헤드리스.
   */
  headed?: boolean;
};

/** YES24 단계 사이 UI 렌더 여유 (2~3초, 매번 랜덤) */
async function renderPause(_onLog?: (message: string) => void): Promise<void> {
  const ms = 2000 + Math.floor(Math.random() * 1001);
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** YES24 통합검색: `query` 값에 도서명을 이중 URL 인코딩(서버가 한 번 디코딩한 뒤 검색어로 사용) */
function buildYes24ProductSearchUrl(title: string): string {
  const q = encodeURIComponent(encodeURIComponent(title.trim()));
  return `https://www.yes24.com/product/search?domain=ALL&query=${q}`;
}

function useHeadedBrowser(options?: Yes24SearchOptions): boolean {
  if (process.env.YES24_FORCE_HEADLESS === "1") return false;
  if (
    process.env.YES24_PLAYWRIGHT_HEADED === "1" ||
    process.env.YES24_HEADED === "1" ||
    process.env.PLAYWRIGHT_HEADED === "1"
  ) {
    return true;
  }
  return options?.headed === true;
}

/**
 * 사용자가 채널을 지정하지 않은 Windows에서는 설치 브라우저를 먼저 시도한다.
 * (Node fetch는 되는데 내장 Chromium만 ERR_NETWORK_ACCESS_DENIED 되는 환경이 흔함)
 */
/** 일부 사이트가 자동화 탐지 시 검색 URL 대신 메인으로 보내는 경우 완화 */
function withYes24LaunchArgs(opts: LaunchOptions): LaunchOptions {
  const flag = "--disable-blink-features=AutomationControlled";
  const args = opts.args ? [...opts.args] : [];
  if (!args.some((a) => a.includes("AutomationControlled"))) args.push(flag);
  return { ...opts, args };
}

function buildChromiumLaunchSequence(options?: Yes24SearchOptions): LaunchOptions[] {
  const ch = (process.env.YES24_PLAYWRIGHT_CHANNEL ?? process.env.PLAYWRIGHT_CHANNEL ?? "").trim();
  const headless = !useHeadedBrowser(options);
  const exe = (process.env.YES24_PLAYWRIGHT_EXECUTABLE ?? process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "").trim();

  if (exe) {
    return [withYes24LaunchArgs({ headless, executablePath: exe })];
  }
  if (ch === "bundled" || ch === "chromium") {
    return [withYes24LaunchArgs({ headless })];
  }
  if (ch === "chrome" || ch === "chrome-beta" || ch === "chrome-dev" || ch === "msedge") {
    return [withYes24LaunchArgs({ headless, channel: ch })];
  }
  if (process.platform === "win32") {
    return [
      withYes24LaunchArgs({ headless, channel: "chrome" }),
      withYes24LaunchArgs({ headless, channel: "msedge" }),
      withYes24LaunchArgs({ headless }),
    ];
  }
  return [withYes24LaunchArgs({ headless })];
}

function isNetworkAccessDeniedMessage(msg: string): boolean {
  return msg.includes("ERR_NETWORK_ACCESS_DENIED") || msg.includes("ACCESS_DENIED");
}

function isYes24ProductSearchPageUrl(pageUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(pageUrl);
  } catch {
    return false;
  }
  return (
    u.hostname.endsWith("yes24.com") &&
    u.pathname.includes("/product/search") &&
    u.searchParams.get("domain") === "ALL"
  );
}

/**
 * 통합검색 URL로 이동한 뒤, 메인(/Main/default 등)으로 튕기면 같은 URL을 재시도한다.
 * (Node fetch는 200인데 브라우저만 메인으로 보내는 경우 대응)
 */
async function openYes24ProductSearchPage(
  page: Page,
  searchUrl: string,
  onLog?: (message: string) => void,
): Promise<void> {
  const max = 5;
  for (let i = 0; i < max; i++) {
    if (i > 0) {
      onLog?.("페이지가 잠깐 엇나가서, 예스24 검색으로 다시 들어가 볼게요.");
      await new Promise<void>((r) => setTimeout(r, 600 + Math.floor(Math.random() * 400)));
    }
    await page.goto(searchUrl, {
      waitUntil: "load",
    });
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
    if (isYes24ProductSearchPageUrl(page.url())) {
      return;
    }
  }
  throw new Error(
    `YES24 통합검색 페이지(/product/search?domain=ALL)에 머물지 못했습니다. 마지막 URL: ${page.url()}`,
  );
}

/** 통합검색 결과 페이지에서: 저자·출판사를 `#reSchKey`에 넣고 `#btnReSchKey`로 재검색 (#brandsWrap 미사용) */
async function fillReSchAuthorPublisherAndSubmit(
  page: Page,
  author: string,
  publisher: string,
  onLog?: (message: string) => void,
): Promise<void> {
  const reSch = page.locator("#reSchKey").first();
  await reSch.waitFor({ state: "visible", timeout: 35_000 });
  onLog?.("더 정확한 검색을 위해 선생님이 입력해 주신 저자명과 출판사명으로 필터링하고 있어요.");
  await renderPause(onLog);
  const combined = `${author.trim()} ${publisher.trim()}`.trim();
  await reSch.fill(combined);
  await renderPause(onLog);
  const btnReSch = page.locator("#btnReSchKey").first();
  await btnReSch.waitFor({ state: "visible", timeout: 15_000 });
  await btnReSch.click();
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
  await renderPause(onLog);
}

async function clickFirstYesSchListItem(page: Page, onLog?: (message: string) => void): Promise<void> {
  const firstLi = page.locator("#yesSchList > li").first();
  await firstLi.waitFor({ state: "visible", timeout: 35_000 });
  onLog?.("검색 목록에서 맞는 책을 짚어볼게요.");
  await renderPause(onLog);
  const link = firstLi.locator("a[href*='Product/Goods'], a[href*='product/goods']").first();
  if ((await link.count()) > 0) {
    await link.click();
  } else {
    await firstLi.click();
  }
  await renderPause(onLog);
}

async function dismissOptionalOverlays(page: Page): Promise<void> {
  const candidates = [
    page.locator("button:has-text('닫기')").first(),
    page.locator("button:has-text('오늘 하루 안 보기')").first(),
    page.locator(".btnClose").first(),
  ];
  for (const loc of candidates) {
    try {
      if (await loc.isVisible({ timeout: 800 })) await loc.click({ timeout: 1500 });
    } catch {
      /* ignore */
    }
  }
}

async function innerTextClean(page: Page, selector: string): Promise<string | null> {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return null;
  const raw = await loc.innerText().catch(() => "");
  const s = raw.replace(/\s+/g, " ").trim();
  return s || null;
}

async function innerTextCleanFirstMatch(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    const t = await innerTextClean(page, sel);
    if (t) return t;
  }
  return null;
}

const COVER_IMG_SELECTORS = [
  "#yDetailTopWrap > div.topColLft > div > div.gd_3dGrp.gdImgLoadOn > div > span.gd_img > em > img",
  "#yDetailTopWrap .gd_img em img",
  "#yDetailTopWrap span.gd_img img",
];

async function coverImageUrlFromDetail(page: Page, onLog?: (message: string) => void): Promise<string | null> {
  for (const sel of COVER_IMG_SELECTORS) {
    const loc = page.locator(sel).first();
    try {
      if ((await loc.count()) === 0) continue;
      await loc.waitFor({ state: "attached", timeout: 5_000 });
      const src = (await loc.getAttribute("src"))?.trim();
      if (!src) continue;
      if (src.startsWith("http://") || src.startsWith("https://")) return src;
      if (src.startsWith("//")) return `https:${src}`;
      if (src.startsWith("/")) return `https://www.yes24.com${src}`;
    } catch {
      /* try next selector */
    }
  }
  onLog?.("표지는 아쉽지만 찾지 못했어요. 다른 정보는 그대로 챙길게요.");
  return null;
}

async function geminiExtractAiFields(
  bundle: { category: string | null; introduce: string | null; author_cmt: string | null; pub_cmt: string | null },
  apiKey: string,
  model: string,
  onLog?: (message: string) => void,
): Promise<{ ai_category: string | null; ai_keywords: string[] }> {
  const parts = [
    bundle.category ? `[카테고리]\n${bundle.category}` : null,
    bundle.introduce ? `[책 소개]\n${bundle.introduce.slice(0, 12000)}` : null,
    bundle.author_cmt ? `[만든이 코멘트]\n${bundle.author_cmt.slice(0, 8000)}` : null,
    bundle.pub_cmt ? `[출판사 리뷰]\n${bundle.pub_cmt.slice(0, 8000)}` : null,
  ].filter(Boolean);
  const blob = parts.join("\n\n");
  if (!blob.trim()) {
    onLog?.("읽어온 글이 너무 적어서 카테고리·해시태그는 비워둘게요.");
    return { ai_category: null, ai_keywords: [] };
  }

  onLog?.("이제 수집한 내용을 토대로 카테고리와 해시태그를 만들게요!");
  const prompt = `당신은 도서 메타데이터를 정리하는 도우미입니다. 아래 텍스트는 모두 YES24에서 가져온 "카테고리·책 소개·만든이 코멘트·출판사 리뷰" 일부입니다.
이 네 가지 블록에 실제로 적힌 내용만 근거로, 독서 지도용으로 쓸 수 있게 간단히 분류·키워드를 뽑아 주세요.

출력 형식은 JSON 한 덩어리뿐이어야 합니다. 마크다운·코드펜스·설명 문장 금지.
형식:
{"ai_category":"한 줄 한국어(예: 청소년 소설 / 과학 교양 등)","ai_keywords":["키워드1","키워드2"]}
- ai_keywords는 한국어 위주로 5~12개, 짧은 명사구.
- 원문에 없는 사실·수상 내역·판매량 등은 만들지 마세요.

--- 내용 시작 ---
${blob}
--- 내용 끝 ---`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1024,
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
    throw new Error(`Gemini API 오류 (${res.status}): ${detail}`);
  }

  const data = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const trimmed = text.trim();
  if (!trimmed) {
    onLog?.("응답이 비어 있어서 카테고리·해시태그는 건너뛸게요.");
    return { ai_category: null, ai_keywords: [] };
  }

  let parsed: { ai_category?: unknown; ai_keywords?: unknown };
  try {
    parsed = JSON.parse(trimmed) as { ai_category?: unknown; ai_keywords?: unknown };
  } catch {
    let t = trimmed;
    const fence = /^```(?:json)?\s*([\s\S]*?)```/m.exec(t);
    if (fence) t = fence[1]!.trim();
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return { ai_category: null, ai_keywords: [] };
    }
    parsed = JSON.parse(t.slice(start, end + 1)) as { ai_category?: unknown; ai_keywords?: unknown };
  }

  const ai_category =
    typeof parsed.ai_category === "string" && parsed.ai_category.trim() ? parsed.ai_category.trim() : null;
  let ai_keywords: string[] = [];
  if (Array.isArray(parsed.ai_keywords)) {
    ai_keywords = parsed.ai_keywords
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 16);
  }
  onLog?.("카테고리와 해시태그까지 정리했어요!");
  return { ai_category, ai_keywords };
}

function networkDeniedHint(): string {
  return [
    "모든 브라우저 구성에서 YES24 접속이 거부되었습니다(net::ERR_NETWORK_ACCESS_DENIED).",
    "① Cursor/샌드박스가 아닌 일반 PowerShell에서 프로젝트 폴더로 이동 후 `npm run dev`",
    "② `YES24_PLAYWRIGHT_HEADED=1` 로 창을 띄워 방화벽·스마트스크린을 확인",
    "③ `YES24_PLAYWRIGHT_EXECUTABLE` 에 Chrome/Edge 실행 파일(.exe) 전체 경로 지정",
    "④ Windows 방화벽에서 node.exe·Chrome·Edge 허용",
  ].join(" ");
}

export async function searchYes24AndAnalyze(
  input: Yes24SearchInput,
  gemini: { apiKey: string; model: string },
  options?: Yes24SearchOptions,
): Promise<Yes24SearchResult> {
  const onLog = options?.onLog;
  const title = input.title.trim();
  const author = input.author.trim();
  const publisher = input.publisher.trim();
  if (!title || !author || !publisher) {
    throw new Error("도서명, 저자/역자, 출판사를 모두 입력해야 합니다.");
  }

  onLog?.(`한우리 AI가 «${title}»(을)를 예스24에서 찾아볼게요.`);
  if (useHeadedBrowser(options)) {
    onLog?.("잠깐 뜨는 창으로 예스24에 들어가요. 끝날 때까지 창을 닫지 말아 주세요.");
  }

  // 메인(/) 미방문 — 브라우저·Node 프로브 모두 통합검색 페이지만 연다
  const yes24SearchUrl = buildYes24ProductSearchUrl(title);

  try {
    await fetch(yes24SearchUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
  } catch {
    /* 연결 확인 실패는 조용히 넘김 — Playwright 단계에서 재시도 */
  }

  const launchSequence = buildChromiumLaunchSequence(options);

  let lastAccessDenied: Error | undefined;

  for (let attempt = 0; attempt < launchSequence.length; attempt++) {
    const launchOpts = launchSequence[attempt]!;
    if (attempt === 0) {
      onLog?.("인터넷 창을 열고 예스24로 갈게요.");
    } else {
      onLog?.("연결이 삐걱여서 다른 방법으로 다시 가볼게요.");
    }
    let browser;
    try {
      browser = await chromium.launch(launchOpts);
    } catch (e) {
      onLog?.("창이 잘 안 열렸어요. 다른 길로 시도해 볼게요.");
      if (attempt < launchSequence.length - 1) {
        continue;
      }
      throw e;
    }
    try {
      const context = await browser.newContext({
        locale: "ko-KR",
        viewport: { width: 1280, height: 900 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(25_000);
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
      });

      onLog?.("예스24 검색 페이지로 들어가고 있어요.");
      try {
        await openYes24ProductSearchPage(page, yes24SearchUrl, onLog);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isNetworkAccessDeniedMessage(msg)) {
          lastAccessDenied = e instanceof Error ? e : new Error(msg);
          if (attempt < launchSequence.length - 1) {
            onLog?.("막혀서 다른 브라우저로 한 번 더 연결해 볼게요.");
            continue;
          }
          throw new Error(`${msg}\n${networkDeniedHint()}`);
        }
        throw e;
      }

      onLog?.("예스24 검색 화면에 도착했어요!");
      await dismissOptionalOverlays(page);
      onLog?.("안내 창이 있으면 살짝 정리하고 있어요.");
      await renderPause(onLog);

      await fillReSchAuthorPublisherAndSubmit(page, author, publisher, onLog);

      await clickFirstYesSchListItem(page, onLog);

      onLog?.("책 상세 페이지를 열고 있어요.");
      await renderPause(onLog);
      await page.waitForSelector("#yDetailTopWrap", { timeout: 25_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

      onLog?.("책을 찾았어요!");

      const detailTitle = await innerTextClean(
        page,
        "#yDetailTopWrap > div.topColRgt > div.gd_infoTop > div.gd_titArea",
      );
      const url = page.url();
      const finalTitle = detailTitle ?? title;

      onLog?.("책 표지를 저장할게요.");
      const cover_url = await coverImageUrlFromDetail(page, onLog);
      if (cover_url) {
        onLog?.("표지까지 예쁘게 담았어요!");
      }

      onLog?.("예스24에 적힌 분야 정보도 읽어올게요.");
      const category = await innerTextClean(page, "#infoset_goodsCate");
      onLog?.(category ? "분야 정보는 읽었어요!" : "분야 칸이 비어 있었어요.");

      onLog?.("책 소개 내용을 수집할게요.");
      const introduce = await innerTextClean(page, "#infoset_introduce");
      onLog?.(introduce ? "책 소개는 수집했어요!" : "책 소개 칸이 비어 있었어요.");

      onLog?.("저자의 책 소개를 수집할게요.");
      const author_cmt = await innerTextClean(page, "#infoset_authorCmt");
      onLog?.(author_cmt ? "저자의 말도 수집했어요!" : "저자 소개는 비어 있었어요.");

      onLog?.("출판사의 책 소개를 수집할게요.");
      const pub_cmt = await innerTextCleanFirstMatch(page, ["#infoset_pubReivew", "#infoset_pubReview"]);
      onLog?.(pub_cmt ? "출판사 소개도 수집했어요!" : "출판사 소개는 비어 있었어요.");

      const ai = await geminiExtractAiFields(
        { category, introduce, author_cmt, pub_cmt },
        gemini.apiKey,
        gemini.model,
        onLog,
      );

      onLog?.("모든 준비가 끝났어요!");
      return {
        title: finalTitle,
        author,
        publisher,
        url,
        cover_url,
        category,
        introduce,
        author_cmt,
        pub_cmt,
        ai_category: ai.ai_category,
        ai_keywords: ai.ai_keywords,
      };
    } finally {
      await browser.close();
    }
  }

  throw lastAccessDenied ?? new Error("YES24 접속에 실패했습니다.");
}
