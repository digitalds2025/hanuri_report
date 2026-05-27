import {
  buildBookAiMetadataPrompt,
  ensureQualityBookAiMetadata,
  hasBookTextCorpus,
  parseBookAiMetadataFromModelText,
  parseYes24CategoryForAiCategory,
} from "./bookAiMetadataParse.ts";

/**
 * YES24 검색·상세 스크래핑 + Gemini로 ai_category / ai_keywords 추출.
 * 실행 위치: 로컬 `npm run dev`(Vite 플러그인) 또는 Cloud Run(`cloud-run/yes24-api/server.ts`가 이 모듈을 import).
 *
 * Cloud Run 주소·브라우저용 API 비밀은 이 파일에 적지 않습니다.
 * → 웹앱 쪽 `src/config/yes24CloudRun.ts` 의 `YES24_CLOUD_RUN_BASE_URL` / `YES24_CLOUD_RUN_API_KEY` 만 수정하세요.
 *
 * Windows에서 `net::ERR_NETWORK_ACCESS_DENIED` 가 나오면:
 * - 채널을 지정하지 않은 경우 **설치된 Chrome → Edge → 내장 Chromium** 순으로 자동 재시도합니다.
 * - 개발 서버(`npm run dev`)에서는 기본 **헤드리스(창 없음)**. 막힐 때만 `YES24_PLAYWRIGHT_HEADED=1`.
 * - `YES24_FORCE_HEADLESS=1` 이면 항상 헤드리스(다른 env가 headed를 켠 경우 무시).
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
   * true면 브라우저 창을 띄움(headless 아님). 로컬 플러그인은 기본 false(헤드리스)를 넘깁니다.
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
  bundle: {
    title?: string | null;
    category: string | null;
    introduce: string | null;
    author_cmt: string | null;
    pub_cmt: string | null;
  },
  apiKey: string,
  model: string,
  onLog?: (message: string) => void,
): Promise<{ ai_category: string | null; ai_keywords: string[] }> {
  if (!hasBookTextCorpus(bundle)) {
    onLog?.("소개·코멘트가 없어 키워드는 비우고, YES24 분야로 분류만 보완할게요.");
    return {
      ai_category: parseYes24CategoryForAiCategory(bundle.category),
      ai_keywords: [],
    };
  }

  onLog?.("소개·저자·출판사 글을 종합해 분류와 대표 키워드 2개를 만들게요!");
  const prompt = buildBookAiMetadataPrompt({
    category: bundle.category,
    introduce: bundle.introduce,
    author_cmt: bundle.author_cmt,
    pub_cmt: bundle.pub_cmt,
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
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
    onLog?.("Gemini 응답이 비어 있어서 카테고리·키워드를 만들지 못했어요. API 키·모델 설정을 확인해 주세요.");
    return { ai_category: null, ai_keywords: [] };
  }

  const parsed = parseBookAiMetadataFromModelText(trimmed);
  const finalized = ensureQualityBookAiMetadata(parsed, { yes24Category: bundle.category });
  if (!finalized.ai_category && finalized.ai_keywords.length === 0) {
    onLog?.("AI 분류·키워드 JSON 해석에 실패했어요. .env 의 VITE_GEMINI_API_KEY·모델을 확인한 뒤 도서 찾기를 다시 시도해 주세요.");
    return { ai_category: null, ai_keywords: [] };
  }
  if (!finalized.ai_category) {
    onLog?.("AI 분류(ai_category)가 비어 있어 YES24 분야로만 보완했어요.");
  }
  if (finalized.ai_keywords.length < 2) {
    onLog?.("소개·코멘트에서 대표 키워드 2개를 뽑지 못했어요. 도서 찾기를 다시 시도해 주세요.");
  }
  onLog?.(
    finalized.ai_category
      ? `카테고리「${finalized.ai_category}」·키워드 ${finalized.ai_keywords.length}개까지 정리했어요!`
      : `키워드 ${finalized.ai_keywords.length}개까지 정리했어요!`,
  );
  return finalized;
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
        { title: finalTitle, category, introduce, author_cmt, pub_cmt },
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
