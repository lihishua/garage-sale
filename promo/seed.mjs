// Puts four items on the demo board so the recorded scenes have company.
import { phone, open, upload, pickLast, createItem, SITE } from "./flow.mjs";
const items = [
  { file: "photos/IMG_0436.jpg", title: "ספה תלת־מושבית", price: 800, tags: ["ריהוט"], size: { "רוחב": 210, "גובה": 85, "עומק": 95 } },
  { file: "photos/IMG_0444.jpg", title: "מקרר", price: 1200, tags: ["מטבח"] },
  { file: "photos/IMG_0445.jpg", title: "כורסת דובי", free: true, tags: ["ילדים"] },
  { file: "photos/IMG_0446.jpg", title: "אריה לקיר", price: 60, tags: ["לבית"] },
];
const ctx = await phone();
const page = await ctx.newPage();
await open(page, `${SITE}/dashboard`);
for (const [n, it] of items.entries()) {
  if (n > 0 || (await page.locator(".gs-pick:not(.used)").count()) === 0) await upload(page, [it.file]);
  await pickLast(page, 1);
  await createItem(page, it);
  console.log("made", it.title);
}
await page.screenshot({ path: "out/seeded.png", fullPage: true });
await ctx.close();
