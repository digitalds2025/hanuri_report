/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** YES24 Cloud Run 등 — 끝 슬래시 없이. 예: https://yes24-api-xxxxx-an.a.run.app */
  readonly VITE_YES24_API_URL?: string;
  /** Cloud Run YES24_API_SECRET 과 동일(브라우저 번들에 포함됨 — 키 제한 권장) */
  readonly VITE_YES24_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
