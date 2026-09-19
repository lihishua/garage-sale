// The title cards, the caption bars (transparent) and the phone mask for video 2.
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(new URL("./cards/how.html", import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
const only = (id) => page.evaluate((id) => {
  document.querySelectorAll(".scene,.cap,.mask").forEach((e) => e.classList.remove("on"));
  document.getElementById("stage").style.display = id.startsWith("start") || id === "end" ? "block" : "none";
  document.getElementById(id).classList.add("on");
}, id);
for (const id of ["start-sell", "start-buy", "end"]) { await only(id); await page.screenshot({ path: `out/how-${id}.png`, clip: { x: 0, y: 0, width: 1080, height: 1920 } }); }
await page.evaluate(() => document.documentElement.classList.add("caps"));
for (let n = 1; n <= 11; n++) { await only(`cap${n}`); await page.screenshot({ path: `out/cap${n}.png`, omitBackground: true, clip: { x: 300, y: 0, width: 780, height: 300 } }); }
await page.evaluate(() => document.documentElement.classList.remove("caps"));
await only("mask"); await page.screenshot({ path: "out/mask.png", omitBackground: true, clip: { x: 300, y: 0, width: 780, height: 1560 } });
await browser.close();
