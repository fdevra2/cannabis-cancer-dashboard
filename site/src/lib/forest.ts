import * as Plot from "@observablehq/plot";
import { cssVar, plotStyle } from "./chart";

export interface ForestRow {
  key: string;
  label: string;
  est: number;
  lcl: number;
  ucl: number;
  group?: string;           // for symbol / emphasis
  emphasis?: boolean;       // highlight in accent; others muted
  tip: string;
}

/** Horizontal forest plot on a log scale with a reference line at 1. */
export function forestPlot(rows: ForestRow[], width: number, opts: {
  xLabel?: string; domain?: [number, number]; symbolBy?: (r: ForestRow) => string; height?: number; marginLeft?: number;
  /** On narrow screens: show only the first label line ("first") or both lines joined ("join"). */
  narrowLabel?: "first" | "join";
} = {}) {
  const narrow = width < 600;
  const lo = Math.min(...rows.map((r) => r.lcl), 0.5), hi = Math.max(...rows.map((r) => r.ucl), 2);
  const domain = opts.domain ?? [Math.max(0.1, lo * 0.9), Math.min(50, hi * 1.1)];
  const clip = (v: number) => Math.min(domain[1], Math.max(domain[0], v));
  const rowH = narrow ? 46 : 40;
  const marginLeft = narrow ? 8 : (opts.marginLeft ?? 300);
  const accent = cssVar("--accent-mark"), muted = cssVar("--muted-mark");
  return Plot.plot({
    width,
    height: opts.height ?? Math.max(120, rows.length * rowH + 60),
    marginLeft,
    marginRight: 24,
    marginTop: 8,
    marginBottom: 40,
    style: plotStyle(),
    x: { type: "log", domain, label: opts.xLabel ?? "Estimate (log scale; 1 = no association)", labelAnchor: "center", grid: true,
         ticks: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].filter((t) => t >= domain[0] && t <= domain[1]), tickFormat: (d: number) => `${d}` },
    y: { domain: rows.map((r) => r.key), label: null, axis: null },
    marks: [
      Plot.ruleX([1], { stroke: cssVar("--ink-3"), strokeWidth: 1 }),
      Plot.ruleY(rows, { y: "key", x1: (r: ForestRow) => clip(r.lcl), x2: (r: ForestRow) => clip(r.ucl),
        stroke: (r: ForestRow) => (r.emphasis === false ? muted : accent), strokeWidth: 2 }),
      Plot.dot(rows, { y: "key", x: (r: ForestRow) => clip(r.est), r: 5,
        symbol: opts.symbolBy ?? (() => "circle"),
        fill: (r: ForestRow) => (r.emphasis === false ? muted : accent), stroke: cssVar("--surface"), strokeWidth: 2 }),
      // Row labels: two lines ("Study year" / detail). Wide: in the left margin; narrow: above each row.
      narrow
        ? Plot.text(rows, { y: "key", x: domain[0], text: (r: ForestRow) => (opts.narrowLabel === "join" ? r.label.replace("\n", " · ") : r.label.split("\n")[0]), textAnchor: "start", dy: -14, fill: cssVar("--ink-2"), fontSize: 12 })
        : Plot.text(rows, { y: "key", x: domain[0], text: "label", textAnchor: "end", dx: -12, fill: cssVar("--ink-2"), fontSize: 12.5, lineHeight: 1.15, lineWidth: 26 }),
      Plot.tip(rows, Plot.pointerY({ y: "key", x: (r: ForestRow) => clip(r.est), title: "tip" })),
    ],
  });
}
