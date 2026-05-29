import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/database";

/** 기본 버킷 id. `.env` `VITE_SUPABASE_STORAGE_BOOK_COVERS_BUCKET` 로 변경 가능 */
export function bookCoverBucketId(): string {
  return (import.meta.env.VITE_SUPABASE_STORAGE_BOOK_COVERS_BUCKET as string | undefined)?.trim() || "book_covers";
}

/** `books.cover_url` 이 이미 우리 Storage 공개 URL인지 */
export function isBookCoverStorageUrl(url: string | null | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u) return false;
  const bucket = bookCoverBucketId();
  if (u.includes(`/object/public/${bucket}/`)) return true;
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/$/, "");
  if (base && u.startsWith(base) && u.includes(`/${bucket}/`)) return true;
  return false;
}

/** Storage object key — ASCII만 허용(한글 경로는 Invalid key). 동일 도서는 같은 폴더. */
export function bookCoverStoragePathPrefix(title: string, author: string, publisher: string): string {
  const key = `${title.trim()}\0${author.trim()}\0${publisher.trim()}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `b${(h >>> 0).toString(36)}`;
}

function extFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  return "jpg";
}

async function uploadBookCoverBlob(
  client: SupabaseClient<Database>,
  pathPrefix: string,
  blob: Blob,
  contentType: string,
): Promise<string> {
  const bucket = bookCoverBucketId();
  const ext = extFromContentType(contentType);
  const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;

  const { error } = await client.storage.from(bucket).upload(path, blob, {
    contentType: contentType || `image/${ext === "jpg" ? "jpeg" : ext}`,
    cacheControl: "86400",
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("표지 공개 URL을 만들지 못했습니다.");
  return data.publicUrl;
}

function base64ToBlob(b64: string, contentType: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

/**
 * YES24 수집 직후 base64 또는 외부 URL을 `book_covers`에 올리고 공개 URL을 반환합니다.
 * 이미 Storage URL이면 그대로 반환합니다.
 */
export async function ensureBookCoverInStorage(
  client: SupabaseClient<Database>,
  input: {
    coverUrl: string | null;
    coverJpegBase64?: string | null;
    title: string;
    author: string;
    publisher: string;
  },
): Promise<string | null> {
  const coverUrl = input.coverUrl?.trim() || null;
  const b64 = input.coverJpegBase64?.trim() || null;
  if (!coverUrl && !b64) return null;
  if (coverUrl && isBookCoverStorageUrl(coverUrl)) return coverUrl;

  const prefix = bookCoverStoragePathPrefix(input.title, input.author, input.publisher);

  if (b64) {
    const blob = base64ToBlob(b64, "image/jpeg");
    return uploadBookCoverBlob(client, prefix, blob, "image/jpeg");
  }

  if (coverUrl) {
    try {
      const res = await fetch(coverUrl, { mode: "cors" });
      if (res.ok) {
        const blob = await res.blob();
        const ct = blob.type || res.headers.get("content-type") || "image/jpeg";
        return uploadBookCoverBlob(client, prefix, blob, ct);
      }
    } catch {
      /* CORS 등 — YES24는 보통 cover_jpeg_base64 로 처리 */
    }
  }

  return null;
}
