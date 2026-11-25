import * as Plot from "@observablehq/plot";
import { loadData } from "../lib/data";
import { figure, cssVar, plotStyle } from "../lib/chart";
import { el } from "../lib/dom";

interface PolicyRow { jurisdiction: string; type: string; medical_text: string; medical_first_year: number | null; adult_use_text: string; adult_use_first_year: number | null; needs_review: boolean }
interface PotencyRow { year: number; thc_pct: number; approximate: boolean; series: string; doi: string; quote: string }
interface PolicyMeta { ncsl: { url: string; page_updated: string; laws_as_of: string; note: string }; potency: PotencyRow[]; potency_note: string }

export async function renderPolicy(root: HTMLElement) {
  const file = await loadData<PolicyRow>("policy.json");
  const meta = file.meta as unknown as PolicyMeta;
  const rows = file.data;
  root.append(
    el("h2", {}, "Policy Context"),
    el("p", { class: "lede" }, "Descriptive background on how U.S. cannabis laws and cannabis potency have changed. Nothing on this page links these trends to cancer risk."),
    el("p", { class: "caveat" }, "Ecological caution: states that changed their laws differ in many ways from those that did not, and a law is not the same as use. These data cannot show whether legalization or potency changes affect cancer."),
  );

  // Cumulative count (states + DC; flagged rows excluded)
  const juris = rows.filter((r) => r.type === "State" && !r.needs_review);
  const years = Array.from({ length: 2026 - 1995 + 1 }, (_, i) => 1995 + i);
  const series = years.flatMap((y) => [
    { year: y, kind: "Medical use law", n: juris.filter((r) => r.medical_first_year != null && r.medical_first_year <= y).length },
    { year: y, kind: "Adult-use law", n: juris.filter((r) => r.adult_use_first_year != null && r.adult_use_first_year <= y).length },
  ]);
  const last = (k: string) => series.filter((s) => s.kind === k).slice(-1)[0];
  const color = (k: string) => (k === "Medical use law" ? cssVar("--accent-mark") : cssVar("--series-2"));
  root.append(figure({
    title: "States with a cannabis law, by year of the law as listed by NCSL",
    what: `By ${last("Medical use law").year}, ${last("Medical use law").n} of the states in NCSL’s table had a medical-use law and ${last("Adult-use law").n} an adult-use law; the shaded band marks the years of NHANES data used on this site (2005–2018).`,
    alt: `Step chart of cumulative numbers of U.S. states with medical and adult-use cannabis laws from 1995 to 2026. Medical: ${[1996, 2005, 2012, 2018, 2026].map((y) => `${y}: ${series.find((s) => s.year === y && s.kind === "Medical use law")!.n}`).join(", ")}. Adult use: ${[2012, 2018, 2026].map((y) => `${y}: ${series.find((s) => s.year === y && s.kind !== "Medical use law")!.n}`).join(", ")}.`,
    render: (w) => Plot.plot({
      width: w, height: 320, marginLeft: 44, marginRight: w < 560 ? 20 : 150, marginBottom: 40, style: plotStyle(),
      x: { domain: [1995, 2026], label: null, tickFormat: (d: number) => `${d}` },
      y: { domain: [0, 45], label: "Number of states", labelAnchor: "top", grid: true },
      marks: [
        Plot.rectX([{ x1: 2005, x2: 2018.99 }], { x1: "x1", x2: "x2", y1: 0, y2: 45, fill: cssVar("--ink"), fillOpacity: 0.05 }),
        Plot.text([{ x: 2012, y: 44 }], { x: "x", y: "y", text: () => "NHANES 2005–2018", fill: cssVar("--ink-3"), fontSize: 12 }),
        Plot.line(series, { x: "year", y: "n", z: "kind", stroke: (d) => color(d.kind), strokeWidth: 2, curve: "step-after" }),
        ...(w >= 560 ? [Plot.text(series.filter((s) => s.year === 2026), { x: "year", y: "n", text: "kind", dx: 8, textAnchor: "start", fill: cssVar("--ink-2"), fontSize: 12 })] : []),
        Plot.tip(series, Plot.pointer({ x: "year", y: "n", title: (d) => `${d.n} states\n${d.kind} by ${d.year}` })),
      ],
    }),
    table: { columns: ["Jurisdiction", "Medical-use law (NCSL)", "Year", "Adult-use (NCSL)", "Year", "Note"],
      rows: rows.map((r) => [r.jurisdiction, r.medical_text, r.medical_first_year ?? "—", r.adult_use_text || "—", r.adult_use_first_year ?? "—", r.needs_review ? "Flagged for review; not charted" : r.type === "Territory" ? "Territory; not charted" : ""]) },
    notes: [
      `Source: NCSL, “State Medical Cannabis Laws”, Table 1 (${meta.ncsl.page_updated}; counts stated ${meta.ncsl.laws_as_of}). ${meta.ncsl.note}`,
      "States not in NCSL’s Table 1 are counted as having no law. The District of Columbia and territories are listed in the table but not charted.",
    ],
  }));
  root.querySelector(".chart:last-of-type .note")?.append(" ", el("a", { href: meta.ncsl.url, target: "_blank", rel: "noopener" }, "ncsl.org"));

  // Potency
  const pot = meta.potency.map((p) => ({ ...p, approximate: String(p.approximate).toUpperCase() === "TRUE" }));
  const seriesNames = [...new Set(pot.map((p) => p.series))];
  const pc = (s: string) => (s === seriesNames[0] ? cssVar("--accent-mark") : cssVar("--series-2"));
  root.append(figure({
    title: "Average THC concentration in DEA-seized herbal cannabis",
    what: "Reported average THC potency of seized illicit cannabis rose from about 4% in 1995 to about 12% in 2014 in one analysis, and from 9.75% in 2009 to 13.88% in 2019 in a later one.",
    alt: "Dot plot of THC percentage by year from two ElSohly et al. analyses: " + pot.map((p) => `${p.year} ${p.approximate ? "about " : ""}${p.thc_pct}%`).join(", "),
    render: (w) => Plot.plot({
      width: w, height: 300, marginLeft: 44, marginBottom: 40, style: plotStyle(),
      x: { domain: [1994, 2020], label: null, tickFormat: (d: number) => `${d}` },
      y: { domain: [0, 18], label: "Mean THC (%)", labelAnchor: "top", grid: true },
      marks: [
        Plot.line(pot, { x: "year", y: "thc_pct", z: "series", stroke: (d) => pc(d.series), strokeWidth: 1.5, strokeOpacity: 0.6 }),
        Plot.dot(pot, { x: "year", y: "thc_pct", r: 5.5, symbol: (d) => (d.series === seriesNames[0] ? "circle" : "square"),
          fill: (d) => (d.approximate ? cssVar("--surface") : pc(d.series)), stroke: (d) => pc(d.series), strokeWidth: 2 }),
        Plot.text(pot, { x: "year", y: "thc_pct", text: (d) => `${d.approximate ? "~" : ""}${d.thc_pct}%`, dy: -14, fill: cssVar("--ink-2"), fontSize: 12 }),
        Plot.tip(pot, Plot.pointer({ x: "year", y: "thc_pct", title: (d) => `${d.approximate ? "~" : ""}${d.thc_pct}% THC in ${d.year}\n${d.series}\n“${d.quote}”` })),
      ],
    }),
    table: { columns: ["Year", "Mean THC (%)", "Source", "Quoted text", "DOI"], rows: pot.map((p) => [p.year, `${p.approximate ? "~" : ""}${p.thc_pct}`, p.series, p.quote, p.doi]) },
    notes: [meta.potency_note, `Circles: ${seriesNames[0]}; squares: ${seriesNames[1]}. Hollow markers are approximate values (“~”).`],
  }));
  root.append(el("ul", { class: "ref-list" },
    el("li", {}, "ElSohly MA, et al. Changes in cannabis potency over the last 2 decades (1995–2014). Biol Psychiatry. 2016. ", el("a", { href: "https://doi.org/10.1016/j.biopsych.2016.01.004", target: "_blank", rel: "noopener" }, "doi:10.1016/j.biopsych.2016.01.004")),
    el("li", {}, "ElSohly MA, et al. A comprehensive review of cannabis potency in the United States in the last decade. Biol Psychiatry Cogn Neurosci Neuroimaging. 2021. ", el("a", { href: "https://doi.org/10.1016/j.bpsc.2020.12.016", target: "_blank", rel: "noopener" }, "doi:10.1016/j.bpsc.2020.12.016"))));
}
