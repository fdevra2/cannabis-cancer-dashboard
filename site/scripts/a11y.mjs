// Accessibility audit: axe-core (WCAG 2.1 A/AA) on every tab, light + dark; keyboard reachability of tabs.
// Usage: node scripts/a11y.mjs [baseURL]
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axeSrc = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const base = process.argv[2] ?? "http://127.0.0.1:5173/";
const tabs = ["overview", "evidence", "nhanes", "exposure", "causal", "ai", "policy", "methods"];
const browser = await chromium.launch();
let total = 0;
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  for (const t of tabs) {
    await page.goto(`${base}#${t}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    // open all <details> so hidden tables are audited too
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    await page.addScriptTag({ content: axeSrc });
    const res = await page.evaluate(async () => (window).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    for (const v of res.violations) {
      total += v.nodes.length;
      console.log(`[${scheme}] #${t} ${v.impact} ${v.id}: ${v.help} (${v.nodes.length})`);
      for (const n of v.nodes.slice(0, 3)) console.log("     ", n.target.join(" "), "|", (n.failureSummary || "").split("\n")[1]?.trim());
    }
  }
  await page.close();
}
// keyboard: Tab from the top reaches every tab link, with visible focus
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${base}#overview`, { waitUntil: "networkidle" });
const reached = new Set();
for (let i = 0; i < 15; i++) {
  await page.keyboard.press("Tab");
  const info = await page.evaluate(() => { const a = document.activeElement; const cs = a ? getComputedStyle(a) : null;
    return { tab: a?.getAttribute("data-tab"), outline: cs ? cs.outlineStyle !== "none" && cs.outlineWidth !== "0px" : false }; });
  if (info.tab) { reached.add(info.tab); if (!info.outline) { console.log("no visible focus on tab", info.tab); total++; } }
}
const missing = tabs.filter((t) => !reached.has(t));
if (missing.length) { console.log("tabs not reachable by keyboard:", missing); total += missing.length; }
console.log(`TOTAL violations: ${total}`);
await browser.close();
process.exit(total ? 1 : 0);
