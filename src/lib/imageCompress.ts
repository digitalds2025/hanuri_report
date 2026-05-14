function loadImageToCanvas(file: File, maxWidth: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas 2d를 사용할 수 없습니다."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 불러오지 못했습니다."));
    };
    img.src = objectUrl;
  });
}

/** 브라우저에서 이미지를 JPEG로 리사이즈·압축해 data URL로 반환 */
export function compressImageToDataUrl(
  file: File,
  opts?: { maxWidth?: number; quality?: number },
): Promise<string> {
  const maxWidth = opts?.maxWidth ?? 720;
  const quality = opts?.quality ?? 0.72;
  return loadImageToCanvas(file, maxWidth).then((canvas) => {
    try {
      return canvas.toDataURL("image/jpeg", quality);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  });
}

/** Supabase Storage 업로드용 JPEG Blob */
export function compressImageToJpegBlob(
  file: File,
  opts?: { maxWidth?: number; quality?: number },
): Promise<Blob> {
  const maxWidth = opts?.maxWidth ?? 720;
  const quality = opts?.quality ?? 0.72;
  return loadImageToCanvas(file, maxWidth).then(
    (canvas) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("이미지 Blob 변환에 실패했습니다."))),
          "image/jpeg",
          quality,
        );
      }),
  );
}
