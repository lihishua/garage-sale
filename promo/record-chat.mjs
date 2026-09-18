// The two chat moments the app itself cannot show: the seller sending her
// link to a group, and the buyer's list landing in the seller's chat.
// Records out/chat-1.webm and out/chat-2.webm (plus their start marks).
import fs from "node:fs";
import { chromium } from "playwright";

const SELLER = process.env.SELLER ?? "demo";       // the demo account's display name
const LINK = "https://www.garagesaleonline.app/demo";

async function clip(name, run) {
  const ctx = await chromium.launch().then((b) => b.newContext({
    viewport: { width: 780, height: 1560 }, locale: "he-IL",
    recordVideo: { dir: "out/raw", size: { width: 780, height: 1560 } },
  }));
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto(new URL("./cards/chat.html", import.meta.url).href);
  await page.evaluate(() => document.fonts.ready);
  const start = (Date.now() - t0) / 1000 + 0.2;
  const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; };
  await run(page, mark);
  await page.waitForTimeout(1500);
  const path = await page.video().path();
  await ctx.close();
  fs.renameSync(path, `out/chat-${name}.webm`);
  fs.writeFileSync(`out/chat-${name}.json`, JSON.stringify({ start, marks }));
  console.log(`chat ${name} -> out/chat-${name}.webm`);
}

// 1 — the neighbours' group: two old messages, then her link goes out
await clip(1, async (page, mark) => {
  await page.evaluate(() => window.setup({ who: "השכונה שלנו", sub: "רוני, מאיה, יובל, אבא של נועם, את", ava: "🏘️" }));
  await page.evaluate(() => window.bubble({ from: "רוני", text: "מישהו מכיר חשמלאי טוב באזור?" }));
  await page.waitForTimeout(250);
  await page.evaluate(() => window.bubble({ from: "מאיה", text: "כן! שולחת לך בפרטי 🙂", blue: true }));
  await page.waitForTimeout(1400);
  mark("type");
  await page.evaluate((LINK) => window.type(`היי! אני עושה מכירת חצר אונליין — הכל כאן:\n${LINK}`, 1300), LINK);
  await page.waitForTimeout(700);
  mark("send");
  await page.evaluate(() => window.send());
  await page.waitForTimeout(900);
  await page.evaluate(() => window.ticks());
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.bubble({ from: "מאיה", text: "וואו, אני רוצה את הספה 😍", blue: true }));
  await page.waitForTimeout(600);
});

// 2 — her own chat with דנה: the list the app composed, arriving
await clip(2, async (page, mark) => {
  await page.evaluate(() => window.setup({ who: "דנה", sub: "050-123-4567", ava: "🙂" }));
  await page.waitForTimeout(1200);
  mark("arrive");
  await page.evaluate((SELLER) => window.bubble({ text: `היי ${SELLER}!\n\n• אריה לקיר — 60₪\n\nסה"כ: 60₪\n\nדנה — 0501234567` }), SELLER);
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.type("מעולה! אפשר לאסוף היום אחרי 5 🙂", 1100));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.send());
  await page.waitForTimeout(900);
  await page.evaluate(() => window.ticks());
  await page.waitForTimeout(400);
});
