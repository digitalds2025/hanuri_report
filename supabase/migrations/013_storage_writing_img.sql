-- 글쓰기 이미지용 Storage 버킷 + 정책 (앱은 anon 키 사용 — 005와 동일 패턴)
-- 이미 대시보드에서 버킷만 만든 경우: ON CONFLICT 시 public 만 유지

INSERT INTO storage.buckets (id, name, public)
VALUES ('writing_img', 'writing_img', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "writing_img_objects_select" ON storage.objects;
CREATE POLICY "writing_img_objects_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'writing_img');

DROP POLICY IF EXISTS "writing_img_objects_insert" ON storage.objects;
CREATE POLICY "writing_img_objects_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'writing_img');

DROP POLICY IF EXISTS "writing_img_objects_update" ON storage.objects;
CREATE POLICY "writing_img_objects_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'writing_img')
  WITH CHECK (bucket_id = 'writing_img');

DROP POLICY IF EXISTS "writing_img_objects_delete" ON storage.objects;
CREATE POLICY "writing_img_objects_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'writing_img');
