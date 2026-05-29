-- Public Storage 버킷: 목록 조회용 SELECT 정책 제거 (공개 URL로 충분, 대시보드 보안 경고 방지)
DROP POLICY IF EXISTS "writing_img_objects_select" ON storage.objects;
DROP POLICY IF EXISTS "book_covers_objects_select" ON storage.objects;
