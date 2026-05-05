const MAX_DIMENSION = 2048;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const INITIAL_QUALITY = 0.8;
const MIN_QUALITY = 0.3;

export async function compressImage(
  file: File,
  maxDimension = MAX_DIMENSION,
  maxSize = MAX_FILE_SIZE,
): Promise<Blob> {
  const img = await loadImage(file);
  const { width, height } = calculateDimensions(
    img.naturalWidth,
    img.naturalHeight,
    maxDimension,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.drawImage(img, 0, 0, width, height);

  let quality = INITIAL_QUALITY;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > maxSize && quality > MIN_QUALITY) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }

  return blob;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight };
  }
  const ratio = Math.min(
    maxDimension / originalWidth,
    maxDimension / originalHeight,
  );
  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      },
      "image/jpeg",
      quality,
    );
  });
}

export function blobToFile(blob: Blob, filename?: string): File {
  const name = filename ?? `compressed_${Date.now()}.jpg`;
  return new File([blob], name, { type: "image/jpeg" });
}
