/**
 * Photos are resized in the browser before upload: one full-size version
 * for the item page and one small thumbnail for the grid. Uploading a 6MB
 * phone photo straight from the camera is what makes these pages slow, so
 * we never do it.
 */

const MIN_WIDTH = 1200;
export const PHOTO_MIN_WIDTH = MIN_WIDTH;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable"));
    img.src = URL.createObjectURL(file);
  });
}

async function scaleTo(img: HTMLImageElement, maxW: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxW / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/webp", quality)
  );
}

export type Prepared = { full: Blob; thumb: Blob; width: number };

/** throws "too_small" if the original is below the quality bar */
export async function prepare(file: File): Promise<Prepared> {
  const img = await loadImage(file);
  if (img.naturalWidth < MIN_WIDTH) throw new Error("too_small");
  const full = await scaleTo(img, 1600, 0.84);
  const thumb = await scaleTo(img, 480, 0.78);
  URL.revokeObjectURL(img.src);
  return { full, thumb, width: img.naturalWidth };
}
