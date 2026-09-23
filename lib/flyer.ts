/**
 * The flyer: one picture a seller can save to her photos and send to anyone,
 * the way a paper flyer used to go on the lamppost. It has no date, no hours
 * and no refreshments on purpose, because the sale is open whenever someone
 * opens the link. The picture says so, and the link is the whole call to action.
 *
 * Drawn on a canvas in the browser, not on the server. The fonts the page
 * already loaded are right there, and her item photos come straight from the
 * public bucket. The yard is an inline SVG with no text in it, because an SVG
 * drawn as an image cannot reach web fonts. Every word goes on the canvas.
 */

const W = 1080;
const H = 1350;
const INK = "#1B1815";
const PAPER = "#FCFBF7";
const ORANGE = "#EE5A2A";
const BUTTER = "#FBE3A4";
const TILE = ["#F7BC45", "#5C9FCC", "#E0336B", "#9ACB3B"];

/** a stall under an awning, drawn loose, in the logo's colours */
const YARD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 440">
<g stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
  ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const x = 20 + i * 50;
    const c = i % 2 ? BUTTER : ORANGE;
    return `<path d="M${x} 42 L${x + 50} 40 L${x + 50} 96 A25 25 0 0 1 ${x} 96 Z" fill="${c}"/>`;
  }).join("")}
  <path d="M42 98 L40 418 M400 98 L402 418" fill="none"/>
  <path d="M404 150 l22 6 l-4 34 l-26 -4 Z" fill="#9ACB3B"/>
  <circle cx="414" cy="166" r="4" fill="${PAPER}"/>
  <path d="M68 298 L372 302 L370 322 L70 320 Z" fill="#F2EBD9"/>
  <path d="M92 322 L90 418 M348 322 L350 418" fill="none"/>
  <path d="M116 298 L116 222" fill="none"/>
  <path d="M100 298 L132 298" fill="none"/>
  <path d="M88 222 L144 222 L130 180 L102 180 Z" fill="#F7BC45"/>
  <path d="M166 298 L256 296 L256 278 L166 280 Z" fill="#5C9FCC"/>
  <path d="M174 280 L248 278 L250 260 L176 262 Z" fill="#E0336B"/>
  <path d="M168 262 L252 260 L252 242 L170 244 Z" fill="#9ACB3B"/>
  <path d="M278 298 L322 298 L328 256 L272 256 Z" fill="#9179C2"/>
  <path d="M300 256 C298 230 304 214 300 196 M300 232 C312 222 322 224 326 216" fill="none"/>
  <circle cx="300" cy="190" r="13" fill="#E0336B"/>
  <circle cx="300" cy="190" r="4" fill="#F7BC45"/>
  <path d="M150 418 L152 366 L256 364 L258 418" fill="#E4C38E"/>
  <path d="M150 366 L204 386 L256 364" fill="none"/>
  <path d="M2 420 L438 418" fill="none"/>
</g>
<g stroke="#9ACB3B" stroke-width="4" stroke-linecap="round" fill="none">
  <path d="M8 418 l-4 -16 M14 418 l2 -20 M20 418 l6 -14"/>
  <path d="M296 418 l-4 -14 M302 418 l2 -18 M308 418 l6 -12"/>
  <path d="M418 418 l-4 -16 M424 418 l2 -20 M430 418 l6 -14"/>
</g>
</svg>`;

const load = (src: string, cors = false) =>
  new Promise<HTMLImageElement | null>((res) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });

/** draws `img` to fill the box, cropped from the middle, as `object-fit: cover` does */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.5);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.fillStyle = "#E0336B";
  ctx.fill();
}

/** the largest size up to `max` at which `text` fits in `width` */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, max: number, width: number) {
  let px = max;
  ctx.font = font(px);
  while (px > 20 && ctx.measureText(text).width > width) ctx.font = font(--px);
  return px;
}

export type FlyerText = { title1: string; title2: string; nots: string; call: string; whose: string };

/**
 * `photos` are thumbnail URLs for the phone's screen. Any that fail to load,
 * or that the bucket will not share with a canvas, become a coloured tile
 * instead: the flyer still reads, it just shows less of her things.
 */
export async function drawFlyer(url: string, text: FlyerText, photos: string[], rtl: boolean) {
  const body = (px: number) => `700 ${px}px "Amatic SC", Heebo, sans-serif`;
  // the link in the hand the prices are written in, a touch heavier to carry
  const link = (px: number) => `600 ${px}px "Playpen Sans Hebrew", Heebo, sans-serif`;
  // the fonts are split by script; asking with the actual words pulls in the
  // Hebrew files, which the page itself may not have needed yet
  const words = Object.values(text).join(" ");
  await Promise.all([
    document.fonts.load(body(100), words),
    document.fonts.load(link(60), url),
  ]).catch(() => {});

  const [yard, arrow, logo, ...pics] = await Promise.all([
    load("data:image/svg+xml;charset=utf-8," + encodeURIComponent(YARD)),
    load("/arrow.webp"),
    load("/logo.webp"),
    ...photos.slice(0, 4).map((p) => load(p, true)),
  ]);

  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // the headline, in two lines, the second in orange
  ctx.fillStyle = INK;
  fit(ctx, text.title1, body, 200, W - 120);
  ctx.fillText(text.title1, W / 2, 205);
  ctx.fillStyle = ORANGE;
  fit(ctx, text.title2, body, 200, W - 120);
  ctx.fillText(text.title2, W / 2, 385);

  // the picture: the yard on the side a reader starts from, the arrow, the
  // phone it turns into
  const top = 440;
  const yardX = rtl ? 600 : 40;
  const phoneX = rtl ? 90 : 750;
  if (yard) ctx.drawImage(yard, yardX, top, 440, 440);
  if (arrow) {
    // centred in the gap between the phone's edge and the stall's
    const aw = 230, ah = (arrow.height / arrow.width) * aw;
    ctx.save();
    ctx.translate(rtl ? 465 : 615, top + 220);
    if (rtl) ctx.scale(-1, 1);
    ctx.drawImage(arrow, -aw / 2, -ah / 2, aw, ah);
    ctx.restore();
  }

  // the phone is outlined with the same 5px line as the stall, so the two
  // read as one drawing rather than a drawing next to a photo of a phone
  const pw = 240, ph = 440, py = top;
  ctx.lineJoin = "round";
  const sx = phoneX + 12, sy = py + 12, sw = pw - 24, sh = ph - 24;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(phoneX, py, pw, ph, 36);
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(phoneX, py, pw, ph);
  if (logo) {
    const lw = 120, lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, sx + (sw - lw) / 2, sy + 26, lw, lh);
  }
  const gap = 10, tw = (sw - gap * 3) / 2, gy = sy + 108;
  for (let i = 0; i < 4; i++) {
    const tx = sx + gap + (i % 2) * (tw + gap);
    const ty = gy + Math.floor(i / 2) * (tw + gap);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, tw, 10);
    ctx.clip();
    ctx.fillStyle = TILE[i];
    ctx.fillRect(tx, ty, tw, tw);
    const pic = pics[i];
    if (pic) cover(ctx, pic, tx, ty, tw, tw);
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, tw, 10);
    ctx.stroke();
    if (i !== 1) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(tx + tw - 17, ty + 17, 13, 0, Math.PI * 2);
      ctx.fill();
      heart(ctx, tx + tw - 17, ty + 18, 7);
    }
  }
  ctx.fillStyle = ORANGE;
  ctx.beginPath();
  ctx.roundRect(sx + 18, sy + sh - 62, sw - 36, 40, 20);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(phoneX, py, pw, ph, 36);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(phoneX + pw / 2 - 30, py + 20, 60, 10, 5);
  ctx.fill();

  // no date, no hours, no refreshments; just the link
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.6;
  fit(ctx, text.nots, body, 76, W - 140);
  ctx.fillText(text.nots, W / 2, 985);
  ctx.globalAlpha = 1;
  fit(ctx, text.call, body, 92, W - 120);
  ctx.fillText(text.call, W / 2, 1085);

  const shown = url.replace(/^https?:\/\//, "");
  ctx.direction = "ltr";
  const lpx = fit(ctx, shown, link, 58, W - 200);
  const lw = ctx.measureText(shown).width + 80;
  ctx.fillStyle = BUTTER;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect((W - lw) / 2, 1125, lw, lpx + 52, (lpx + 52) / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(shown, W / 2, 1125 + (lpx + 52) / 2 + 2);
  ctx.textBaseline = "alphabetic";

  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.globalAlpha = 0.7;
  fit(ctx, text.whose, body, 60, W - 140);
  ctx.fillText(text.whose, W / 2, 1300);
  ctx.globalAlpha = 1;

  return new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
}
