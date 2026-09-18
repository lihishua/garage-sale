// Renders each scene of a card page to a PNG: cards/<name>.html -> out/<name>-<n>.png
// usage: node shots.mjs why 5
import { chromium } from "playwright";
const [name, count] = [process.argv[2], Number(process.argv[3])];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(new URL(`./cards/${name}.html`, import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
for (let n = 0; n < count; n++) {
  await page.evaluate((n) => window.show(n), n);
  await page.waitForTimeout(700); // the card's slide-in settles
  await page.screenshot({ path: `out/${name}-${n + 1}.png` });
}
await browser.close();
