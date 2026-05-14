/**
 * 배포 사이트에서 YES24(Cloud Run + `yes24BookScrape.ts`)를 쓰려면 **아래 두 export만** 채우면 됩니다.
 * (`yes24BookScrape.ts`에는 적지 마세요. 그 파일은 스크래핑 로직만 담당합니다.)
 *
 * 버튼은 이 주소로 `POST /api/local/books/yes24-search` 를 호출합니다.
 *
 * 둘 다 비우면 빌드 시 주입한 `VITE_YES24_API_URL` / `VITE_YES24_API_KEY` 를 사용합니다(GitHub Actions 등).
 * 공개 저장소라면 URL만 여기 두고, API 키는 Actions Secret 으로만 넣는 편이 안전합니다.
 */
export const YES24_CLOUD_RUN_BASE_URL = "https://hanuri-report-364392170079.asia-northeast3.run.app"; // 예: "https://서비스이름-xxxxx-xx.a.run.app" (끝 / 없음)
export const YES24_CLOUD_RUN_API_KEY = "digitaldaesunghanuribookcrawling"; // Cloud Run 환경변수 YES24_API_SECRET 과 동일한 문자열
