// Screenshot a tab: node scripts/shot.mjs <hash> <out.png> [dark] [width]
import { chromium } from "playwright";
const [hash = "overview", out = "shot.png", mode = "light", width = "1280"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +width, height: 900 }, colorScheme: mode === "dark" ? "dark" : "light" });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE ?? "http://127.0.0.1:5173/"}#${hash}`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: true });
if (errors.length) console.error("PAGE ERRORS:\n" + errors.join("\n"));
await browser.close();
