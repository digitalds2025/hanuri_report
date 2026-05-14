import { compressImageToJpegBlob } from "./imageCompress";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/database";

/** 기본 버킷 id (대시보드에서 만든 이름과 맞춤). 바꾸려면 .env `VITE_SUPABASE_STORAGE_WRITING_BUCKET` */
export function writingImageBucketId(): string {
  return (import.meta.env.VITE_SUPABASE_STORAGE_WRITING_BUCKET as string | undefined)?.trim() || "writing_img";
}

/**
 * 글쓰기 이미지 1장을 Storage에 올리고 공개 URL을 반환합니다.
 * 경로: `{studentId}/{uuid}.jpg`
 */
export async function uploadWritingImageForStudent(
  client: SupabaseClient<Database>,
  studentId: string,
  file: File,
): Promise<string> {
  const bucket = writingImageBucketId();
  const blob = await compressImageToJpegBlob(file, { maxWidth: 720, quality: 0.72 });
  const safeStudent = studentId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "unknown";
  const name = `${crypto.randomUUID()}.jpg`;
  const path = `${safeStudent}/${name}`;

  const { error } = await client.storage.from(bucket).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("공개 URL을 만들지 못했습니다.");
  return data.publicUrl;
}
