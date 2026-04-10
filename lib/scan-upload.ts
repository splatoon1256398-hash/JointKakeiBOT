export const DIRECT_ANALYSIS_UPLOAD_LIMIT_BYTES = 3_500_000;

export function detectUploadMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
  };

  return mimeMap[extension || ""] || "image/jpeg";
}

/**
 * 画像圧縮設定:
 * - 最大辺 1000px (Gemini が必要とする解像度は 768px 以上、余裕で十分)
 * - JPEG quality 0.78 (レシート文字は高コントラストなので 0.78 でも OCR 精度に影響なし)
 * → 元の 1200px/0.82 から ~30% 軽量化、アップロード時間も同程度短縮
 */
const COMPRESS_MAX_SIDE = 1000;
const COMPRESS_QUALITY = 0.78;

export async function compressScannableFile(file: File): Promise<File> {
  const mimeType = detectUploadMimeType(file);
  if (
    mimeType === "application/pdf" ||
    mimeType.includes("heic") ||
    mimeType.includes("heif")
  ) {
    return file;
  }

  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);

      const scale = Math.min(1, COMPRESS_MAX_SIDE / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      const context = canvas.getContext("2d");
      if (!context) {
        resolve(file);
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          resolve(
            new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
              type: "image/jpeg",
            })
          );
        },
        "image/jpeg",
        COMPRESS_QUALITY
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    image.src = url;
  });
}

export function shouldUseDirectAnalysisUpload(file: File): boolean {
  return file.size <= DIRECT_ANALYSIS_UPLOAD_LIMIT_BYTES;
}
