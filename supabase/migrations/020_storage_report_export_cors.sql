-- =============================================================================
-- 월간 레포트 JPG/PDF보내기 · Storage 공개 읽기
-- =============================================================================
--
-- [중요] CORS 헤더는 SQL 한 줄로 “Storage 전용” 설정하는 메뉴가 없습니다.
-- 예전 문서의 「Project Settings → API → CORS」는 2025년 이후 대시보드에 없습니다.
--
-- ■ Storage (글쓰기 이미지 writing_img)
--   1) 아래 SQL로 public 버킷 + 읽기 정책 적용
--   2) Dashboard 왼쪽 「Storage」→ writing_img → Public 버킷인지 확인
--   3) 호스팅 Supabase는 public 객체 URL에 CORS가 기본 허용되는 경우가 많음
--      (별도 CORS 화면 없음). 그래도 캡처 실패 시 브라우저 Network 탭에서
--      이미지 요청 Response Headers에 access-control-allow-origin 있는지 확인
--
-- ■ Auth (로그인)
--   Dashboard 「Authentication」→ URL Configuration
--   배포(GitHub Pages): Site URL https://digitalds2025.github.io/hanuri_report
--   Redirect URLs: https://digitalds2025.github.io/hanuri_report/** , http://localhost:5173/**
--
-- ■ Data API (REST) CORS — 필요할 때만 SQL Editor에서 실행
--   (Settings → Data API 메뉴에는 CORS 토글이 없을 수 있음)
--
--   ALTER ROLE authenticator SET pgrst.server_cors_allowed_origins =
--     'http://localhost:5173,http://localhost:4173,https://YOUR-PRODUCTION-DOMAIN';
--   NOTIFY pgrst, 'reload config';
--
-- ■ JPG/PDF oklab 오류
--   앱 코드(html2canvas)에서 Tailwind oklab() 제거 처리함 — 대시보드 설정과 무관
-- =============================================================================

-- 글쓰기 이미지 버킷 (공개 읽기)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'writing_img',
  'writing_img',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public 버킷: 공개 URL로 읽기. 목록용 SELECT 정책은 두지 않음(대시보드 보안 경고 방지).

-- 업로드
DROP POLICY IF EXISTS "writing_img_objects_insert" ON storage.objects;
CREATE POLICY "writing_img_objects_insert"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'writing_img');

DROP POLICY IF EXISTS "writing_img_objects_update" ON storage.objects;
CREATE POLICY "writing_img_objects_update"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'writing_img')
  WITH CHECK (bucket_id = 'writing_img');

DROP POLICY IF EXISTS "writing_img_objects_delete" ON storage.objects;
CREATE POLICY "writing_img_objects_delete"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'writing_img');

-- 도서 표지 — YES24 수집 후 앱이 업로드, books.cover_url 에 공개 URL 저장
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'book_covers',
  'book_covers',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "book_covers_objects_select" ON storage.objects;

DROP POLICY IF EXISTS "book_covers_objects_insert" ON storage.objects;
CREATE POLICY "book_covers_objects_insert"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'book_covers');

DROP POLICY IF EXISTS "book_covers_objects_update" ON storage.objects;
CREATE POLICY "book_covers_objects_update"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'book_covers')
  WITH CHECK (bucket_id = 'book_covers');

DROP POLICY IF EXISTS "book_covers_objects_delete" ON storage.objects;
CREATE POLICY "book_covers_objects_delete"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'book_covers');
