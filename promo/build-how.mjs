// The two "how" videos — out/sell.mp4 and out/buy.mp4 — one phone screen
// each, in a frame on the paper, under a caption bar. Segments run at the
// recordings' natural pace; captions change on the marks the recorders
// wrote; the segments are chained with cross-fades under the music.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const sh = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const meta = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

const FADE = 0.5;
const PHONE = { w: 780, h: 1560, x: 150, y: 300 };

/** one segment: the phone (video) in its frame on the paper, captions over it */
function segment(name, src, caps) {
  const m = meta(src.replace(".webm", ".json")); const start = m.start; const len = dur(src) - start;
  const t = (mark) => (mark == null ? 0 : m.marks[mark] - start);
  const args = ["-i", src, "-i", "out/mask.png", ...caps.flatMap(([png]) => ["-i", png])];
  let f = `[1]format=rgba,split=2[m1][m2];[m1]alphaextract[mp];[m2]alphaextract,scale=${PHONE.w + 6}:${PHONE.h + 6}[me];` +
    `[0]trim=start=${start},setpts=PTS-STARTPTS,fps=30,format=rgba[pv];[pv][mp]alphamerge[pp];` +
    `color=c=#1B1815:s=${PHONE.w + 6}x${PHONE.h + 6}:r=30:d=${len},format=rgba[pe];[pe][me]alphamerge[pf];` +
    `color=c=#FCFBF7:s=1080x1920:r=30:d=${len}[bg];` +
    `[bg][pf]overlay=${PHONE.x - 3}:${PHONE.y - 3}[g1];[g1][pp]overlay=${PHONE.x}:${PHONE.y}[g2]`;
  let last = "g2";
  caps.forEach(([png, from, to], i) => {
    const a = t(from), b = to == null ? len + 1 : t(to);
    f += `;[${last}][${2 + i}]overlay=0:40:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'[g${3 + i}]`;
    last = `g${3 + i}`;
  });
  f += `;[${last}]trim=duration=${len},format=yuv420p[v]`;
  sh([...args, "-filter_complex", f, "-map", "[v]", "-r", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "18", `out/seg-${name}.mp4`]);
  console.log(`seg ${name}: ${len.toFixed(1)}s`);
  return `out/seg-${name}.mp4`;
}
function card(name, png, len) {
  sh(["-loop", "1", "-t", String(len), "-i", png, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "fast", "-crf", "18", `out/seg-${name}.mp4`]);
  console.log(`seg ${name}: ${len}s (card)`);
  return `out/seg-${name}.mp4`;
}
const cap = (n, from = null, to = null) => [`out/cap${n}.png`, from, to];

const videos = {
  sell: () => [
    card("start-sell", "out/how-start-sell.png", 2.5),
    segment("a", "out/scene-a.webm", [cap(1, null, "create"), cap(2, "create", "link"), cap(3, "link")]),
    segment("group", "out/chat-group.webm", [cap(4)]),
    segment("inbox", "out/chat-inbox.webm", [cap(5)]),
    segment("c", "out/scene-c.webm", [cap(6)]),
    card("end", "out/how-end.png", 3.0),
  ],
  buy: () => [
    card("start-buy", "out/how-start-buy.png", 2.5),
    segment("invite", "out/chat-invite.webm", [cap(7)]),
    segment("b", "out/scene-b.webm", [cap(8, null, "list"), cap(9, "list", "form"), cap(10, "form")]),
    segment("reply", "out/chat-reply.webm", [cap(11)]),
    card("end", "out/how-end.png", 3.0),
  ],
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(videos);
for (const name of wanted) {
  const list = videos[name]();
  const lens = list.map(dur);
  let f = "", prev = "[0:v]", offset = 0;
  for (let i = 1; i < list.length; i++) {
    offset += lens[i - 1] - FADE;
    const out = i === list.length - 1 ? "[vv]" : `[x${i}]`;
    f += `${prev}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${out};`;
    prev = out;
  }
  const total = offset + lens[lens.length - 1];
  f += `[vv]fade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6,format=yuv420p[v];` +
    `[${list.length}:a]loudnorm=I=-20:TP=-2:LRA=11,atrim=0:${total.toFixed(2)},afade=t=in:d=0.6,afade=t=out:st=${(total - 1.6).toFixed(2)}:d=1.5[a]`;
  sh([...list.flatMap((s) => ["-i", s]), "-i", "music/happy-ukulele.mp3", "-filter_complex", f, "-map", "[v]", "-map", "[a]",
    "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", `out/${name}.mp4`]);
  console.log(`out/${name}.mp4: ${total.toFixed(1)}s`);
}
