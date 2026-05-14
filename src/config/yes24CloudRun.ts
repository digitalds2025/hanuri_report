/**
 * 배포 사이트에서 YES24(Cloud Run + `yes24BookScrape.ts`)를 쓰려면 여기만 채우면 됩니다.
 * 버튼은 이 주소로 `POST /api/local/books/yes24-search` 를 호출합니다.
 *
 * 둘 다 비우면 빌드 시 주입한 `VITE_YES24_API_URL` / `VITE_YES24_API_KEY` 를 사용합니다(GitHub Actions 등).
 * 공개 저장소라면 URL만 여기 두고, API 키는 Actions Secret 으로만 넣는 편이 안전합니다.
 */
export const YES24_CLOUD_RUN_BASE_URL = "";
export const YES24_CLOUD_RUN_API_KEY = "";
