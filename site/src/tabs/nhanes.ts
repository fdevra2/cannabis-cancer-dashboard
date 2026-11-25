import * as Plot from "@observablehq/plot";
import { loadData, type Proportion } from "../lib/data";
import { figure, cssVar, plotStyle, shortCycle } from "../lib/chart";
import { el } from "../lib/dom";
import { pct, int } from "../lib/format";

export async function renderNhanes(root: HTMLElement) {
  root.append(
    el("h2", {}, "NHANES Explorer"),
    el("p", { class: "lede" },
      "Design-based estimates from the National Health and Nutrition Examination Survey (NHANES), 2005–2018, adults aged 20–59."),
  );
  const slot = el("div");
  root.append(slot);
  const { meta, data } = await loadData<Proportion>("prev_ever_by_cycle.json");
  slot.append(everUseFigure(data, meta.sample ?? ""));
}

export function everUseFigure(rows: Proportion[], sample: string): HTMLElement {
  const shown = rows.filter((r) => r.status !== "suppress");
  const lo = Math.min(...shown.map((r) => r.p)), hi = Math.max(...shown.map((r) => r.p));
  const render = (width: number) => {
    const narrow = width < 560;
    return Plot.plot({
      width,
      height: narrow ? 300 : 340,
      marginLeft: 44,
      marginTop: 30,
      marginRight: 64,
      marginBottom: width < 480 ? 48 : 40,
      style: plotStyle(),
      x: { label: width < 480 ? "Survey cycle (first year)" : null, labelAnchor: "center", padding: 0.4, tickSize: 0,
          tickFormat: width < 480 ? (c: string) => `’${c.slice(2, 4)}` : narrow ? shortCycle : undefined },
      y: { domain: [0, 1], label: "Ever used marijuana (%)", labelAnchor: "top", tickFormat: (d: number) => `${Math.round(d * 100)}`, grid: true, ticks: 5 },
      marks: [
        Plot.ruleY([0], { stroke: cssVar("--axis") }),
        Plot.ruleX(shown, { x: "group", y1: "lcl", y2: "ucl", stroke: cssVar("--accent-mark"), strokeWidth: 2, strokeLinecap: "round" }),
        Plot.dot(shown, { x: "group", y: "p", r: 5.5, fill: cssVar("--accent-mark"), stroke: cssVar("--surface"), strokeWidth: 2 }),
        Plot.text(shown.slice(-1), { x: "group", y: "p", text: (d: Proportion) => pct(d.p), dx: 12, textAnchor: "start", fill: cssVar("--ink"), fontWeight: 600 }),
        Plot.tip(shown, Plot.pointerX({
          x: "group", y: "p",
          title: (d: Proportion) => `${pct(d.p)}  (95% CI ${pct(d.lcl)}–${pct(d.ucl)})\n${d.group} · unweighted n = ${int(d.n)}`,
        })),
      ],
    });
  };
  const allOverlap = Math.max(...shown.map((r) => r.lcl)) <= Math.min(...shown.map((r) => r.ucl));
  return figure({
    title: "Ever used marijuana or hashish, by survey cycle",
    what: `About ${Math.round(lo * 100)}–${Math.round(hi * 100)}% of U.S. adults aged 20–59 reported ever using marijuana in every cycle from 2005–2006 to 2017–2018${allOverlap ? "; every cycle's confidence interval overlaps every other's" : ""}.`,
    alt: `Dot plot with 95% confidence intervals. Weighted prevalence of ever using marijuana among adults 20–59 by NHANES cycle: ${rows.map((r) => `${r.group} ${pct(r.p)}`).join(", ")}.`,
    render,
    table: {
      columns: ["Cycle", "Weighted %", "95% CI", "Unweighted n", "Reliability"],
      rows: rows.map((r) => [r.group, r.status === "suppress" ? "—" : pct(r.p), r.status === "suppress" ? "—" : `${pct(r.lcl)}–${pct(r.ucl)}`, int(r.n),
        r.status === "ok" ? "Meets NCHS standards" : r.status === "review" ? `Review: ${r.reason}` : `Suppressed: ${r.reason}`]),
    },
    notes: [
      `Sample: ${sample}.`,
      "Bars are Korn–Graubard 95% confidence intervals. Estimates failing NCHS Data Presentation Standards for Proportions would be suppressed (none here). Self-reported, cross-sectional data.",
    ],
  });
}
