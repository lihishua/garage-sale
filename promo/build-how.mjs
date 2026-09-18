// Video 2 — "how". Two homes: the seller's phone on the right, the buyer's
// on the left. Whoever is acting is the big phone (700×1400); the other
// waits small (300×600) and dimmed on their own couch. Segments run at the
// recordings' natural pace; captions change on the marks the recorder
// wrote; the whole thing is chained with cross-fades under the music.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const sh = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const meta = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const still = (src, at, out) => sh(["-ss", String(at), "-i", src, "-frames:v", "1", out]);

const FADE = 0.5;
const BIG = { w: 700, h: 1400, top: 330 }, SMALL = { w: 300, h: 600, top: 1130 };
const X = { seller: { big: 340, small: 40 }, buyer: { big: 40, small: 740 } };

/** one segment: a backdrop, the big phone (video), the small phone (still), captions */
function segment(name, { active, big, small, caps }) {
  const other = active === "seller" ? "buyer" : "seller";
  const m = meta(big.meta); const start = m.start; const len = dur(big.src) - start;
  const t = (mark) => (mark == null ? 0 : m.marks[mark] - start);
  const capFilters = caps.map(([png, from, to], i) => `[c${i}]`).join("");
  const args = ["-i", `out/stage-${active}.png`, "-i", big.src, "-i", small, "-i", "out/mask.png",
    ...caps.flatMap(([png]) => ["-i", png])];
  const n = 4;
  let f = `[3]format=rgba,split=4[m1][m2][m3][m4];` +
    `[m1]alphaextract,scale=${BIG.w}:${BIG.h}[mb];[m2]alphaextract,scale=${BIG.w + 6}:${BIG.h + 6}[mbe];` +
    `[m3]alphaextract,scale=${SMALL.w}:${SMALL.h}[ms];[m4]alphaextract,scale=${SMALL.w + 4}:${SMALL.h + 4}[mse];` +
    `[1]trim=start=${start},setpts=PTS-STARTPTS,fps=30,scale=${BIG.w}:${BIG.h},format=rgba[bv];[bv][mb]alphamerge[bp];` +
    `color=c=#1B1815:s=${BIG.w + 6}x${BIG.h + 6}:r=30:d=${len},format=rgba[be];[be][mbe]alphamerge[bf];` +
    `[2]scale=${SMALL.w}:${SMALL.h},format=rgba,colorchannelmixer=aa=0.55[sv];[sv][ms]alphamerge[sp];` +
    `color=c=#1B1815:s=${SMALL.w + 4}x${SMALL.h + 4}:r=30:d=${len},format=rgba,colorchannelmixer=aa=0.55[se];[se][mse]alphamerge[sf];` +
    `[0]loop=-1:1,trim=duration=${len},fps=30[bg];` +
    `[bg][sf]overlay=${X[active].small - 2}:${SMALL.top - 2}[g1];[g1][sp]overlay=${X[active].small}:${SMALL.top}[g2];` +
    `[g2][bf]overlay=${X[active].big - 3}:${BIG.top - 3}[g3];[g3][bp]overlay=${X[active].big}:${BIG.top}[g4]`;
  let last = "g4";
  caps.forEach(([png, from, to], i) => {
    const a = t(from), b = to == null ? len + 1 : t(to);
    f += `;[${last}][${n + i}]overlay=0:40:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'[g${5 + i}]`;
    last = `g${5 + i}`;
  });
  f += `;[${last}]trim=duration=${len},format=yuv420p[v]`;
  sh([...args, "-filter_complex", f, "-map", "[v]", "-r", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "18", `out/seg-${name}.mp4`]);
  console.log(`seg ${name}: ${len.toFixed(1)}s (${active})`);
  return `out/seg-${name}.mp4`;
}

function card(name, png, len) {
  sh(["-loop", "1", "-t", String(len), "-i", png, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "fast", "-crf", "18", `out/seg-${name}.mp4`]);
  console.log(`seg ${name}: ${len}s (card)`);
  return `out/seg-${name}.mp4`;
}

// the stills the waiting phone shows
const A = meta("out/scene-a.json"), B = meta("out/scene-b.json");
still("out/scene-b.webm", B.start + 0.3, "out/still-b-first.png");
still("out/scene-a.webm", dur("out/scene-a.webm") - 0.2, "out/still-a-last.png");
still("out/scene-b.webm", dur("out/scene-b.webm") - 0.2, "out/still-b-last.png");

const segs = [
  card("start", "out/how-start.png", 3.0),
  segment("a", { active: "seller", big: { src: "out/scene-a.webm", meta: "out/scene-a.json" }, small: "out/still-b-first.png",
    caps: [["out/cap1.png", null, "create"], ["out/cap2.png", "create", "link"], ["out/cap3.png", "link", null]] }),
  segment("chat1", { active: "seller", big: { src: "out/chat-1.webm", meta: "out/chat-1.json" }, small: "out/still-b-first.png",
    caps: [["out/cap4.png", null, null]] }),
  segment("b", { active: "buyer", big: { src: "out/scene-b.webm", meta: "out/scene-b.json" }, small: "out/still-a-last.png",
    caps: [["out/cap5.png", null, "send"], ["out/cap6.png", "send", null]] }),
  segment("chat2", { active: "seller", big: { src: "out/chat-2.webm", meta: "out/chat-2.json" }, small: "out/still-b-last.png",
    caps: [["out/cap7.png", null, null]] }),
  segment("c", { active: "seller", big: { src: "out/scene-c.webm", meta: "out/scene-c.json" }, small: "out/still-b-last.png",
    caps: [["out/cap8.png", null, null]] }),
  card("end", "out/how-end.png", 3.5),
];

// chain with cross-fades, then the music
const lens = segs.map(dur);
let f = "", prev = "[0:v]", offset = 0;
for (let i = 1; i < segs.length; i++) {
  offset += lens[i - 1] - FADE;
  const out = i === segs.length - 1 ? "[vv]" : `[x${i}]`;
  f += `${prev}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${out};`;
  prev = out;
}
const total = offset + lens[lens.length - 1];
f += `[vv]fade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6,format=yuv420p[v];` +
  `[${segs.length}:a]loudnorm=I=-20:TP=-2:LRA=11,atrim=0:${total.toFixed(2)},afade=t=in:d=0.6,afade=t=out:st=${(total - 1.6).toFixed(2)}:d=1.5[a]`;
sh([...segs.flatMap((s) => ["-i", s]), "-i", "music/happy-ukulele.mp3", "-filter_complex", f, "-map", "[v]", "-map", "[a]",
  "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "out/how.mp4"]);
console.log(`out/how.mp4: ${total.toFixed(1)}s`);
