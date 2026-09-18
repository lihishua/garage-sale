/**
 * Photos are resized in the browser before upload: one full-size version
 * for the item page and one small thumbnail for the grid. Uploading a 6MB
 * phone photo straight from the camera is what makes these pages slow, so
 * we never do it.
 */

const MIN_WIDTH = 1200;
export const PHOTO_MIN_WIDTH = MIN_WIDTH;

/** a decoded photo, the right way up, and how to let go of it */
type Decoded = { src: CanvasImageSource; width: number; height: number; close: () => void };

/**
 * A phone stores a photo the way the sensor saw it and adds a note — the
 * EXIF orientation — saying which way is up. Drawing onto a canvas drops
 * the note, so if the browser did not turn the pixels while decoding, the
 * photo is saved sideways for good. createImageBitmap is asked to apply
 * the note outright; only a browser without it falls back to <img>, which
 * every current one turns as well.
 */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { src: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* an option this browser does not know, or a format it cannot decode this way */ }
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("unreadable"));
    el.src = URL.createObjectURL(file);
  });
  return { src: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(img.src) };
}

async function scaleTo(d: Decoded, maxW: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxW / d.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(d.width * scale);
  canvas.height = Math.round(d.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(d.src, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/webp", quality)
  );
}

export type Prepared = { full: Blob; thumb: Blob; width: number };

/**
 * The saved photo, turned a quarter turn clockwise: both sizes again, from
 * the full-size file. For the book photographed lying on its side — the
 * EXIF note only knows which way the phone was held, not which way the
 * thing in front of it was.
 */
export async function rotated(full: Blob): Promise<Prepared> {
  const d = await decode(new File([full], "full.webp", { type: full.type || "image/webp" }));
  try {
    const turn = (maxW: number, quality: number): Promise<Blob> => {
      // the long side becomes the short one, so the cap is on the turned width
      const scale = Math.min(1, maxW / d.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(d.height * scale);
      canvas.height = Math.round(d.width * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(d.src, 0, 0, canvas.height, canvas.width);
      return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/webp", quality)
      );
    };
    const fullOut = await turn(1400, 0.82);
    const thumb = await turn(320, 0.74);
    return { full: fullOut, thumb, width: d.height };
  } finally {
    d.close();
  }
}

/** throws "too_small" if the original is below the quality bar */
export async function prepare(file: File): Promise<Prepared> {
  const d = await decode(file);
  try {
    // the bar is on the longer side: a portrait shot is as good a photo as
    // the same one turned, and its width is the short side
    if (Math.max(d.width, d.height) < MIN_WIDTH) throw new Error("too_small");
    // The grid draws thumbs at 132-168px, so 480 was three times more pixels
    // than any screen asks for — bytes paid for on every upload and every card.
    // 320 still covers a 2x phone screen at the widest tile.
    const full = await scaleTo(d, 1400, 0.82);
    const thumb = await scaleTo(d, 320, 0.74);
    return { full, thumb, width: d.width };
  } finally {
    d.close();
  }
}
