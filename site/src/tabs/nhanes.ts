import * as Plot from "@observablehq/plot";
import { loadData, type Proportion, type GridRow, type HpvRow, type TimingRow, type PirRow } from "../lib/data";
import { figure, cssVar, plotStyle, shortCycle, responsive } from "../lib/chart";
import { forestPlot, type ForestRow } from "../lib/forest";
import { el } from "../lib/dom";
import { pct, int } from "../lib/format";
import { select, checkboxes, controlRow } from "../lib/controls";
import { evalue } from "../lib/evalue";
import { pickedEstimate } from "../lib/store";

const BLOCK_ORDER = ["demo", "tobacco", "alcohol", "ses"] as const;
const BLOCK_SHORT: Record<string, string> = { demo: "Demographics", tobacco: "Tobacco", alcohol: "Alcohol", ses: "Socioeconomic" };
const f2 = (x: number) => x.toFixed(2);

export const SURVIVORSHIP =
  "NHANES only includes people who were alive, living in the community and well enough to attend the mobile examination center. People who died of cancer — especially fatal cancers such as lung cancer — are under-represented, so “ever told you had cancer” mostly captures survivors of less lethal cancers.";

interface GridMeta {
  blocks: Record<string, string>; outcomes: Record<string, string>; exposures: Record<string, string>; samples: Record<string, string>;
  analytic_sample_rule: string; flag_rule: string; model: string;
}

export async function renderNhanes(root: HTMLElement) {
  root.append(
    el("h2", {}, "NHANES Explorer"),
    el("p", { class: "lede" },
      "Design-based estimates from the National Health and Nutrition Examination Survey (NHANES), 2005–2018, adults aged 20–59. Use the controls to see how much an association depends on what you adjust for, how you define cannabis use, and who you count."),
    el("p", { class: "caveat" }, el("strong", {}, "Survivorship bias. "), SURVIVORSHIP),
  );
  const [prev, ever, grid, rc, hpv] = await Promise.all([
    loadData<Proportion>("prevalence.json"), loadData<Proportion>("prev_ever_by_cycle.json"),
    loadData<GridRow>("models_grid.json"), loadData<TimingRow>("reverse_causation.json"), loadData<HpvRow>("models_hpv.json"),
  ]);
  const meta = grid.meta as unknown as GridMeta;

  const nav = el("nav", { class: "legend-inline", "aria-label": "On this page" },
    el("a", { href: "#nhanes/toggle" }, "Confounding toggle"), el("a", { href: "#nhanes/missing" }, "Missing income"), el("a", { href: "#nhanes/speccurve" }, "Specification curve"),
    el("a", { href: "#nhanes/reverse" }, "Reverse-causation lens"), el("a", { href: "#nhanes/hpv" }, "HPV sensitivity"),
    el("a", { href: "#nhanes/prevalence" }, "Prevalence"));
  root.append(nav);

  // Shared selection between toggle and spec curve
  // Opens on the headline model (all four covariate groups) so it matches the Overview.
  const sel = { outcome: "cancer_any", exposure: "x_ever", sample: "main", blocks: ["demo", "tobacco", "alcohol", "ses"] as string[] };
  const listeners: (() => void)[] = [];
  const changed = () => listeners.forEach((f) => f());

  root.append(toggleSection(grid.data, meta, sel, changed, listeners));
  const pir = await loadData<PirRow>("models_pir.json");
  root.append(pirSection(pir.data, meta, sel, listeners));
  root.append(specCurveSection(grid.data, meta, sel, listeners));
  root.append(reverseSection(rc.data, grid.data, meta));
  root.append(hpvSection(hpv.data, meta));
  root.append(prevalenceSection(prev.data, prev.meta as unknown as { measures: Record<string, { label: string }> }, ever.data, ever.meta.sample ?? ""));

  // scroll to sub-anchor (#nhanes/toggle)
  const sub = location.hash.split("/")[1];
  if (sub) requestAnimationFrame(() => document.getElementById(`nhanes-${sub}`)?.scrollIntoView());
}

const blocksKey = (b: string[]) => BLOCK_ORDER.filter((x) => b.includes(x)).join("+");
const findRow = (rows: GridRow[], o: string, e: string, s: string, b: string[]) =>
  rows.find((r) => r.outcome === o && r.exposure === e && r.sample === s && r.blocks === blocksKey(b));

/* ---------------- Confounding toggle ---------------- */
function toggleSection(rows: GridRow[], meta: GridMeta, sel: { outcome: string; exposure: string; sample: string; blocks: string[] },
                       changed: () => void, listeners: (() => void)[]) {
  const sec = el("section", { class: "section", id: "nhanes-toggle", "aria-labelledby": "toggle-h" },
    el("h3", { id: "toggle-h" }, "Confounding toggle"),
    el("p", { class: "sub" }, "Add or remove groups of covariates and watch the cannabis odds ratio move. Every number is a separate survey-weighted logistic regression on the same people."));
  const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
  sec.append(controlRow(
    select("Outcome", opts(meta.outcomes), sel.outcome, (v) => { sel.outcome = v; changed(); }),
    select("Cannabis exposure", opts(meta.exposures), sel.exposure, (v) => { sel.exposure = v; changed(); }),
    select("Sample", opts(meta.samples), sel.sample, (v) => { sel.sample = v; changed(); }),
  ));
  const layout = el("div", { class: "grid-2" });
  const checks = checkboxes("Adjust for", BLOCK_ORDER.map((b) => ({
    value: b, label: BLOCK_SHORT[b], hint: meta.blocks[b].replace(/^[^(]*\(/, "").replace(/\)$/, ""), checked: sel.blocks.includes(b),
  })), (v) => { sel.blocks = v; changed(); });
  const out = el("div", { class: "card", "aria-live": "polite" });
  layout.append(el("div", { class: "card" }, checks), out);
  sec.append(layout);
  const pathHost = el("div");
  sec.append(pathHost);

  function update() {
    const r = findRow(rows, sel.outcome, sel.exposure, sel.sample, sel.blocks)!;
    const crude = findRow(rows, sel.outcome, sel.exposure, sel.sample, [])!;
    const ev = evalue(r.or, r.lcl, r.ucl, "OR", false);
    const adj = sel.blocks.length ? BLOCK_ORDER.filter((b) => sel.blocks.includes(b)).map((b) => BLOCK_SHORT[b].toLowerCase()).join(", ") : "nothing (crude)";
    const includesNull = r.lcl <= 1 && r.ucl >= 1;
    out.replaceChildren(
      el("div", { class: "hero" },
        el("span", { class: "label" }, `Odds ratio: ${meta.exposures[sel.exposure]} → ${meta.outcomes[sel.outcome].toLowerCase()}`),
        el("span", { class: "big" }, f2(r.or)),
        el("span", { class: "ci" }, `95% CI ${f2(r.lcl)}–${f2(r.ucl)}`)),
      el("p", {}, `Adjusted for ${adj}. `, includesNull
        ? "The confidence interval includes 1, so these data are compatible with no association."
        : r.or > 1 ? "The confidence interval is entirely above 1 (an association, not necessarily a cause)." : "The confidence interval is entirely below 1."),
      el("p", {}, `Crude odds ratio ${f2(crude.or)} → this model ${f2(r.or)}.`),
      el("div", { class: "stat-row" },
        el("span", {}, el("strong", {}, int(r.n)), " people"), el("span", {}, el("strong", {}, int(r.cases)), " with cancer history"),
        el("span", {}, el("strong", {}, int(r.exp_cases)), " exposed cases"), el("span", {}, "E-value ", el("strong", {}, ev.point.toFixed(2)), ` (CI: ${ev.ci.toFixed(2)})`)),
      r.flag === "imprecise" ? el("p", { class: "callout" }, "Imprecise: fewer than 10 exposed or unexposed cases.") : el("span"),
      (() => {
        const b = el("button", { type: "button", class: "linkish" }, "Explore this estimate in the E-value calculator →");
        b.addEventListener("click", () => {
          pickedEstimate.set({ label: `NHANES: ${meta.exposures[sel.exposure]}, ${meta.outcomes[sel.outcome].toLowerCase()}, adjusted for ${adj}`, est: r.or, lcl: r.lcl, ucl: r.ucl, measure: "OR", source: "NHANES 2005–2018 (this site)" });
          location.hash = "#causal/evalue";
        });
        return b;
      })(),
    );
    pathHost.replaceChildren(pathFigure(rows, meta, sel));
  }
  listeners.push(update);
  update();
  return sec;
}

function pathFigure(rows: GridRow[], meta: GridMeta, sel: { outcome: string; exposure: string; sample: string; blocks: string[] }) {
  const steps: { key: string; label: string; blocks: string[] }[] = [
    { key: "crude", label: "Crude", blocks: [] },
    { key: "d", label: "+ Demographics", blocks: ["demo"] },
    { key: "dt", label: "+ Tobacco", blocks: ["demo", "tobacco"] },
    { key: "dta", label: "+ Alcohol", blocks: ["demo", "tobacco", "alcohol"] },
    { key: "dtas", label: "+ Socioeconomic", blocks: ["demo", "tobacco", "alcohol", "ses"] },
  ];
  const cur = blocksKey(sel.blocks);
  const onPath = steps.some((s) => blocksKey(s.blocks) === cur);
  if (!onPath) steps.push({ key: "you", label: "Your selection", blocks: sel.blocks });
  const data = steps.map((s) => ({ ...s, row: findRow(rows, sel.outcome, sel.exposure, sel.sample, s.blocks)!, current: blocksKey(s.blocks) === cur }));
  const lo = Math.min(0.7, ...data.map((d) => d.row.lcl)) * 0.95, hi = Math.max(1.5, ...data.map((d) => d.row.ucl)) * 1.05;
  const tob0 = data[1].row, tob1 = data[2].row;
  return figure({
    title: "How the odds ratio changes as covariate groups are added in sequence",
    what: `Adding tobacco after demographics moves the odds ratio from ${f2(tob0.or)} to ${f2(tob1.or)} for this exposure and outcome; the highlighted point is your current selection.`,
    alt: `Line of odds ratios with 95% CIs: ${data.map((d) => `${d.label} ${f2(d.row.or)} (${f2(d.row.lcl)}–${f2(d.row.ucl)})`).join("; ")}.`,
    render: (w) => Plot.plot({
      width: w, height: 300, marginLeft: 48, marginBottom: 50, marginRight: 20, style: plotStyle(),
      x: { domain: data.map((d) => d.label), label: null, tickSize: 0, tickRotate: w < 560 ? -25 : 0 },
      y: { type: "log", domain: [lo, hi], label: "Odds ratio (log scale)", labelAnchor: "top", grid: true, tickFormat: (d: number) => `${d}`,
           ticks: [0.5, 0.7, 1, 1.5, 2, 3, 5].filter((t) => t >= lo && t <= hi) },
      marks: [
        Plot.ruleY([1], { stroke: cssVar("--ink-3") }),
        Plot.line(data.filter((d) => d.key !== "you"), { x: "label", y: (d) => d.row.or, stroke: cssVar("--muted-mark"), strokeWidth: 1.5 }),
        Plot.ruleX(data, { x: "label", y1: (d) => d.row.lcl, y2: (d) => d.row.ucl, stroke: (d) => (d.current ? cssVar("--accent-mark") : cssVar("--muted-mark")), strokeWidth: 2 }),
        Plot.dot(data, { x: "label", y: (d) => d.row.or, r: (d) => (d.current ? 7 : 5), fill: (d) => (d.current ? cssVar("--accent-mark") : cssVar("--muted-mark")), stroke: cssVar("--surface"), strokeWidth: 2 }),
        Plot.text(data.filter((d) => d.current), { x: "label", y: (d) => d.row.or, text: (d) => f2(d.row.or), dx: 14, textAnchor: "start", fill: cssVar("--ink"), fontWeight: 600 }),
        Plot.tip(data, Plot.pointerX({ x: "label", y: (d) => d.row.or, title: (d) => `OR ${f2(d.row.or)} (95% CI ${f2(d.row.lcl)}–${f2(d.row.ucl)})\n${d.label}` })),
      ],
    }),
    table: { columns: ["Model", "OR", "95% CI", "n", "Cases"], rows: data.map((d) => [d.label, f2(d.row.or), `${f2(d.row.lcl)}–${f2(d.row.ucl)}`, int(d.row.n), int(d.row.cases)]) },
    notes: [`${meta.analytic_sample_rule}.`, `${meta.model}.`, SURVIVORSHIP],
  });
}

/* ---------------- Missing income data sensitivity ---------------- */
function pirSection(rows: PirRow[], meta: GridMeta, sel: { outcome: string }, listeners: (() => void)[]) {
  const sec = el("section", { class: "section", id: "nhanes-missing", "aria-labelledby": "pir-h" },
    el("h3", { id: "pir-h" }, "Sensitivity: missing income data"),
    el("p", { class: "sub" }, "The main analysis drops people with a missing income-to-poverty ratio (complete case). The alternative keeps them, coding missing income as its own category. Both are fully adjusted; the outcome follows the toggle above."));
  const host = el("div");
  sec.append(host);
  const expShort: Record<string, string> = { x_ever: "Ever used", x_regular: "Regular use", x_past30: "Past 30 days", x_heavy: "≥20 joint-years" };
  const draw = () => {
    const rs = rows.filter((r) => r.outcome === sel.outcome);
    const fr: ForestRow[] = rs.map((r) => ({ key: `${r.exposure}-${r.approach}`, label: `${expShort[r.exposure]}\n${r.approach === "complete_case" ? "Complete case (main)" : "Missing income as a category"}`,
      est: r.or, lcl: r.lcl, ucl: r.ucl, emphasis: r.approach !== "complete_case",
      tip: `OR ${f2(r.or)} (95% CI ${f2(r.lcl)}–${f2(r.ucl)})\nn = ${int(r.n)}, cases = ${int(r.cases)}${r.n_pir_missing ? `, incl. ${int(r.n_pir_missing)} with missing income` : ""}` }));
    const ev = (a: string) => rs.find((r) => r.exposure === "x_ever" && r.approach === a)!;
    const changes = rs.filter((r) => r.approach === "missing_category").filter((m) => {
      const c = rs.find((r) => r.exposure === m.exposure && r.approach === "complete_case")!;
      return (c.lcl <= 1 && c.ucl >= 1) !== (m.lcl <= 1 && m.ucl >= 1);
    }).map((m) => expShort[m.exposure].toLowerCase());
    host.replaceChildren(figure({
      title: `Complete case vs missing-income category: ${meta.outcomes[sel.outcome].toLowerCase()}`,
      what: `For ever-use, the fully adjusted odds ratio is ${f2(ev("complete_case").or)} (95% CI ${f2(ev("complete_case").lcl)}–${f2(ev("complete_case").ucl)}) with complete cases and ${f2(ev("missing_category").or)} (${f2(ev("missing_category").lcl)}–${f2(ev("missing_category").ucl)}) when missing income is kept as a category${changes.length ? `; whether the confidence interval includes 1 changes for ${changes.join(", ")}` : "; neither choice changes whether any interval includes 1"}.`,
      alt: "Forest plot comparing complete-case and missing-category models: " + fr.map((r) => `${r.label.replace("\n", ", ")} ${f2(r.est)} (${f2(r.lcl)}–${f2(r.ucl)})`).join("; "),
      render: (w) => forestPlot(fr, w, { domain: [0.5, 5], marginLeft: 320, narrowLabel: "join" }),
      table: { columns: ["Exposure", "Approach", "OR", "95% CI", "n", "Cases"], rows: rs.map((r) => [expShort[r.exposure], r.approach === "complete_case" ? "Complete case (main)" : "Missing income as a category", f2(r.or), `${f2(r.lcl)}–${f2(r.ucl)}`, int(r.n), int(r.cases)]) },
      notes: ["A missing-indicator category is a simple sensitivity check, not a fix: it can itself be biased. Multiple imputation was not performed. Grey = complete case; blue = missing-income category."],
    }));
  };
  listeners.push(draw);
  draw();
  return sec;
}

/* ---------------- Specification curve ---------------- */
function specCurveSection(rows: GridRow[], meta: GridMeta, sel: { outcome: string; exposure: string; sample: string; blocks: string[] }, listeners: (() => void)[]) {
  const sec = el("section", { class: "section", id: "nhanes-speccurve", "aria-labelledby": "spec-h" },
    el("h3", { id: "spec-h" }, "Specification curve: every reasonable model at once"),
    el("p", { class: "sub" },
      "Instead of reporting one “best” model, a specification curve (Simonsohn, Simmons & Nelson, 2020) shows the estimate from every defensible combination of choices — here 16 covariate sets × 4 exposure definitions × 3 samples = 192 models for the outcome chosen above. The toggle is one point on this curve (highlighted)."));
  const host = el("div");
  sec.append(host);
  const update = () => host.replaceChildren(specFigure(rows, meta, sel));
  listeners.push(update);
  update();
  return sec;
}

function specFigure(all: GridRow[], meta: GridMeta, sel: { outcome: string; exposure: string; sample: string; blocks: string[] }) {
  const rows = all.filter((r) => r.outcome === sel.outcome).slice().sort((a, b) => a.or - b.or);
  const data = rows.map((r, i) => ({ ...r, i, current: r.exposure === sel.exposure && r.sample === sel.sample && r.blocks === blocksKey(sel.blocks) }));
  const above = data.filter((d) => d.lcl > 1).length, below = data.filter((d) => d.ucl < 1).length;
  const median = data[Math.floor(data.length / 2)].or;
  const expKeys = Object.keys(meta.exposures), sampKeys = Object.keys(meta.samples);
  const expShort: Record<string, string> = { x_ever: "Ever used", x_regular: "Regular use", x_past30: "Past 30 days", x_heavy: "≥20 joint-years" };
  const sampShort: Record<string, string> = { main: "All respondents", excl_after: "Excl. started after dx", excl_after_same: "Excl. after/same year" };
  const indRows = [
    ...BLOCK_ORDER.map((b) => ({ key: `b:${b}`, group: "Adjusted for", label: BLOCK_SHORT[b], test: (d: GridRow) => d.blocks.split("+").includes(b) })),
    ...expKeys.map((e) => ({ key: `e:${e}`, group: "Exposure", label: expShort[e] ?? e, test: (d: GridRow) => d.exposure === e })),
    ...sampKeys.map((s) => ({ key: `s:${s}`, group: "Sample", label: sampShort[s] ?? s, test: (d: GridRow) => d.sample === s })),
  ];
  const marks = data.flatMap((d) => indRows.filter((r) => r.test(d)).map((r) => ({ i: d.i, row: r.key, current: d.current })));
  const lo = Math.min(...data.map((d) => d.lcl)) * 0.95, hi = Math.max(...data.map((d) => d.ucl)) * 1.05;

  const render = (w: number) => {
    const ml = w < 560 ? 112 : 150;
    const top = Plot.plot({
      width: w, height: 260, marginLeft: ml, marginRight: 12, marginBottom: 8, style: plotStyle(),
      x: { domain: [-1, data.length], axis: null },
      y: { type: "log", domain: [lo, hi], label: "Odds ratio (log)", labelAnchor: "top", grid: true, tickFormat: (d: number) => `${d}`, ticks: [0.5, 0.7, 1, 1.5, 2, 3, 5].filter((t) => t >= lo && t <= hi) },
      marks: [
        Plot.ruleY([1], { stroke: cssVar("--ink-3") }),
        Plot.ruleX(data, { x: "i", y1: "lcl", y2: "ucl", stroke: (d) => (d.current ? cssVar("--accent-mark") : cssVar("--grid")), strokeWidth: (d) => (d.current ? 2.5 : 1.5) }),
        Plot.dot(data, { x: "i", y: "or", r: 2.2, fill: (d) => (d.lcl > 1 || d.ucl < 1 ? cssVar("--ink-2") : cssVar("--muted-mark")) }),
        Plot.dot(data.filter((d) => d.current), { x: "i", y: "or", r: 6, fill: cssVar("--accent-mark"), stroke: cssVar("--surface"), strokeWidth: 2 }),
        Plot.tip(data, Plot.pointerX({ x: "i", y: "or", title: (d) => `OR ${f2(d.or)} (95% CI ${f2(d.lcl)}–${f2(d.ucl)})\n${expShort[d.exposure]} · ${sampShort[d.sample]}\nAdjusted for: ${d.blocks ? d.blocks.split("+").map((b: string) => BLOCK_SHORT[b]).join(", ") : "nothing (crude)"}` })),
      ],
    });
    const bottom = Plot.plot({
      width: w, height: indRows.length * 18 + 20, marginLeft: ml, marginRight: 12, marginTop: 4, marginBottom: 16, style: plotStyle(),
      x: { domain: [-1, data.length], axis: null },
      y: { domain: indRows.map((r) => r.key), tickFormat: (k: string) => indRows.find((r) => r.key === k)!.label, label: null, tickSize: 0 },
      marks: [
        Plot.ruleY(indRows.map((r) => r.key), { stroke: cssVar("--grid") }),
        Plot.tickX(marks, { x: "i", y: "row", stroke: (m) => (m.current ? cssVar("--accent-mark") : cssVar("--ink-3")), strokeWidth: (m) => (m.current ? 3 : 1) }),
      ],
    });
    return el("div", {}, top, bottom);
  };
  return figure({
    title: `Specification curve: ${meta.outcomes[sel.outcome].toLowerCase()}`,
    what: `Across all ${data.length} specifications the odds ratio ranges from ${f2(data[0].or)} to ${f2(data[data.length - 1].or)} (median ${f2(median)}); ${above} have a confidence interval entirely above 1, ${below} entirely below 1, and ${data.length - above - below} include 1.`,
    alt: `Specification curve of ${data.length} odds ratios sorted from lowest to highest, with a panel below marking which covariates, exposure definition and sample each model used. ${above} of ${data.length} have confidence intervals entirely above 1.`,
    render,
    table: {
      columns: ["Rank", "OR", "95% CI", "Exposure", "Sample", "Adjusted for", "n"],
      rows: data.map((d) => [d.i + 1, f2(d.or), `${f2(d.lcl)}–${f2(d.ucl)}`, expShort[d.exposure], sampShort[d.sample], d.blocks ? d.blocks.split("+").map((b) => BLOCK_SHORT[b]).join(", ") : "None", int(d.n)]),
    },
    notes: [
      "Top: each dot is one model’s odds ratio (darker dots: confidence interval excludes 1); vertical lines are 95% CIs. Bottom: tick marks show the choices behind each model. Regular use and ≥20 joint-years are only available 2009–2018, so those models use fewer people.",
      "This is a descriptive specification curve; the joint permutation test from Simonsohn et al. is not performed here.",
    ],
  });
}

/* ---------------- Reverse-causation lens ---------------- */
function reverseSection(rc: TimingRow[], grid: GridRow[], meta: GridMeta) {
  const sec = el("section", { class: "section", id: "nhanes-reverse", "aria-labelledby": "rev-h" },
    el("h3", { id: "rev-h" }, "Reverse-causation lens"),
    el("p", { class: "sub" },
      "People diagnosed with cancer may start using cannabis to manage symptoms. If so, cancer would cause cannabis use rather than the reverse. NHANES records the age when people first tried cannabis (and, from 2009, the age they started using it regularly) and the age at their first cancer diagnosis, so we can see who started after diagnosis."));
  const timing = rc.filter((r) => r.group_var === "timing");
  const lv = ["Before diagnosis", "Same year", "After diagnosis"];
  const colors: Record<string, string> = { "Before diagnosis": "var(--seg-before)", "Same year": "var(--series-3)", "After diagnosis": "var(--series-2)" };
  const bars = el("div", { class: "seg-bars" });
  for (const m of ["first_use_timing", "regular_timing"]) {
    const rs = lv.map((l) => timing.find((r) => r.measure === m && r.group === l)!);
    const label = m === "first_use_timing" ? "First tried cannabis (cancer survivors who ever used, 2005–2018)" : "Started regular use (cancer survivors who were regular users, 2009–2018)";
    const bar = el("div", { class: "segbar", role: "img", "aria-label": `${label}: ` + rs.map((r) => `${r.group} ${pct(r.p)} (${r.count} people)`).join(", ") });
    for (const r of rs) {
      const seg = el("div", { class: "seg", style: `width:${(100 * r.p).toFixed(2)}%;background:${colors[r.group]}`, title: `${r.group}: ${pct(r.p)} (95% CI ${pct(r.lcl)}–${pct(r.ucl)}); ${r.count} people` });
      if (r.p > 0.12) seg.append(el("span", {}, pct(r.p, 0)));
      bar.append(seg);
    }
    bars.append(el("div", { class: "segrow" }, el("div", { class: "seglabel" }, label, el("span", { class: "hint" }, ` · n = ${int(rs[0].n)}`)), bar));
  }
  const legend = el("div", { class: "legend-inline" }, ...lv.map((l) => el("span", {}, el("span", { class: "key", style: `background:${colors[l]}` }), l)));
  const tbl = timing.map((r) => [r.measure === "first_use_timing" ? "First use" : "Regular-use onset", r.group, pct(r.p), `${pct(r.lcl)}–${pct(r.ucl)}`, String(r.count), int(r.n)]);
  sec.append(el("figure", { class: "chart" },
    el("figcaption", {}, el("h3", {}, "When did cancer survivors start using cannabis?"),
      el("p", { class: "what" }, el("strong", {}, "What this shows: "),
        `Most survivors who used cannabis started before their diagnosis; ${pct(timing.find((r) => r.measure === "first_use_timing" && r.group === "After diagnosis")!.p)} first tried it after, and ${pct(timing.find((r) => r.measure === "regular_timing" && r.group === "After diagnosis")!.p)} of regular users began regular use after diagnosis.`)),
    legend, bars,
    el("details", {}, el("summary", {}, "Show data table"), el("div", { class: "table-wrap" }, tableEl(["Timing of", "Relative to first diagnosis", "Weighted %", "95% CI", "People", "Denominator n"], tbl))),
    el("p", { class: "note" }, "Ages are in whole years, so “same year” cannot be ordered. First-use timing cannot detect people who resumed or increased use after diagnosis — the medical-cannabis pattern most likely to matter.")));

  // ORs re-estimated excluding post-diagnosis initiators (all four blocks)
  const outc = "cancer_any";
  const full = "demo+tobacco+alcohol+ses";
  const expShort: Record<string, string> = { x_ever: "Ever used", x_regular: "Regular use", x_past30: "Past 30 days", x_heavy: "≥20 joint-years" };
  const sampShort: Record<string, string> = { main: "All respondents", excl_after: "Excluding cases who started after diagnosis", excl_after_same: "Excluding after or same year" };
  const fr: ForestRow[] = [];
  for (const e of Object.keys(meta.exposures)) for (const s of Object.keys(meta.samples)) {
    const r = grid.find((g) => g.outcome === outc && g.exposure === e && g.sample === s && g.blocks === full)!;
    fr.push({ key: `${e}-${s}`, label: `${expShort[e]}\n${sampShort[s]}`, est: r.or, lcl: r.lcl, ucl: r.ucl, emphasis: s === "main" ? false : true,
      tip: `OR ${f2(r.or)} (95% CI ${f2(r.lcl)}–${f2(r.ucl)})\n${expShort[e]} · ${sampShort[s]}\nn = ${int(r.n)}, cases = ${int(r.cases)}` });
  }
  const ever = (s: string) => grid.find((g) => g.outcome === outc && g.exposure === "x_ever" && g.sample === s && g.blocks === full)!;
  const reg = (s: string) => grid.find((g) => g.outcome === outc && g.exposure === "x_regular" && g.sample === s && g.blocks === full)!;
  sec.append(figure({
    title: "Odds ratios before and after removing people who started after diagnosis",
    what: `Dropping cases who started using after their diagnosis moves the fully adjusted odds ratio for ever use from ${f2(ever("main").or)} to ${f2(ever("excl_after").or)}, and for regular use from ${f2(reg("main").or)} to ${f2(reg("excl_after").or)}.`,
    alt: "Forest plot of fully adjusted odds ratios for any cancer, for four exposure definitions in three samples: " + fr.map((r) => `${r.label.replace("\n", ", ")}: ${f2(r.est)} (${f2(r.lcl)}–${f2(r.ucl)})`).join("; "),
    render: (w) => forestPlot(fr, w, { domain: [0.5, 4], marginLeft: 320, narrowLabel: "join" }),
    table: { columns: ["Exposure / sample", "OR", "95% CI"], rows: fr.map((r) => [r.label.replace("\n", " — "), f2(r.est), `${f2(r.lcl)}–${f2(r.ucl)}`]) },
    notes: ["Outcome: any cancer. All models adjusted for demographics, tobacco, alcohol and socioeconomic factors. Grey = all respondents; blue = after excluding post-diagnosis starters.", "For regular use and ≥20 joint-years, timing uses the age regular use began."],
  }));

  // Current use by time since diagnosis
  const ysd = rc.filter((r) => r.group_var === "years_since_dx");
  sec.append(figure({
    title: "Past-30-day cannabis use among cancer survivors, by years since diagnosis",
    what: (() => {
      const ref = ysd.find((r) => r.group === "No cancer history")!;
      const sv = ysd.filter((r) => r.group !== "No cancer history");
      const overlap = sv.every((r) => r.lcl <= ref.ucl && r.ucl >= ref.lcl);
      return `Past-30-day use among survivors (${sv.map((r) => `${r.group} since diagnosis: ${pct(r.p)}`).join(", ")}) compared with ${pct(ref.p)} among people with no cancer history; ${overlap ? "every survivor group's confidence interval overlaps the no-cancer group's" : "at least one survivor group's confidence interval does not overlap the no-cancer group's"}.`;
    })(),
    alt: "Dot plot with 95% CIs of past-30-day cannabis use: " + ysd.map((r) => `${r.group} ${pct(r.p)}`).join(", "),
    render: (w) => Plot.plot({
      width: w, height: 240, marginLeft: w < 560 ? 120 : 160, marginRight: 30, marginBottom: 46, style: plotStyle(),
      x: { domain: [0, 0.3], label: "Used cannabis in past 30 days (%)", labelAnchor: "center", labelOffset: 38, tickFormat: (d: number) => `${Math.round(d * 100)}`, grid: true },
      y: { domain: ysd.map((r) => r.group), label: null, tickSize: 0 },
      marks: [
        Plot.ruleY(ysd, { y: "group", x1: "lcl", x2: "ucl", stroke: (r: Proportion) => (r.group === "No cancer history" ? cssVar("--muted-mark") : cssVar("--accent-mark")), strokeWidth: 2 }),
        Plot.dot(ysd, { y: "group", x: "p", r: 5, fill: (r: Proportion) => (r.group === "No cancer history" ? cssVar("--muted-mark") : cssVar("--accent-mark")), stroke: cssVar("--surface"), strokeWidth: 2 }),
        Plot.tip(ysd, Plot.pointerY({ y: "group", x: "p", title: (r: Proportion) => `${pct(r.p)} (95% CI ${pct(r.lcl)}–${pct(r.ucl)})\nunweighted n = ${int(r.n)}` })),
      ],
    }),
    table: { columns: ["Group", "Weighted %", "95% CI", "n"], rows: ysd.map((r) => [r.group, pct(r.p), `${pct(r.lcl)}–${pct(r.ucl)}`, int(r.n)]) },
    notes: ["Cross-sectional: the same people are not followed over time, so this cannot show that use changed after diagnosis.", SURVIVORSHIP],
  }));
  return sec;
}

/* ---------------- HPV sensitivity ---------------- */
function hpvSection(rows: HpvRow[], meta: GridMeta) {
  const sec = el("section", { class: "section", id: "nhanes-hpv", "aria-labelledby": "hpv-h" },
    el("h3", { id: "hpv-h" }, "Does accounting for HPV change the picture?"),
    el("p", { class: "sub" },
      "HPV causes cervical and many oropharyngeal cancers and is linked to sexual behaviour, which is also associated with cannabis use. NHANES measured HPV in oral rinses (2009–2016) and vaginal swabs (women, 2005–2016), and asked about lifetime sex partners (2005–2016). Each sensitivity model runs on its own subsample."));
  const setLabel: Record<string, string> = { crude: "Crude", demo: "+ Demographics", main4: "+ Tobacco, alcohol, socioeconomic", main4_hpv: "+ HPV measure" };
  const outc: Record<string, string> = { ...meta.outcomes, cancer_cervical: "Cervical cancer (women)" };
  const subs = [...new Set(rows.map((r) => r.subsample))];
  const state = { exposure: "x_ever" };
  const host = el("div");
  sec.append(controlRow(select("Cannabis exposure", [{ value: "x_ever", label: "Ever used (vs never)" }, { value: "x_regular", label: "Regular use (vs never)" }], state.exposure, (v) => { state.exposure = v; draw(); })), host);
  function draw() {
    host.replaceChildren(...subs.map((s) => {
      const rs = rows.filter((r) => r.subsample === s && r.exposure === state.exposure);
      const fr: ForestRow[] = rs.map((r) => ({ key: `${r.outcome}-${r.set}`, label: `${outc[r.outcome] ?? r.outcome}\n${setLabel[r.set]}`, est: r.or, lcl: r.lcl, ucl: r.ucl,
        emphasis: r.set === "main4_hpv", tip: `OR ${f2(r.or)} (95% CI ${f2(r.lcl)}–${f2(r.ucl)})\n${setLabel[r.set]}\nn = ${int(r.n)}, cases = ${int(r.cases)}, exposed cases = ${int(r.exp_cases)}${r.flag === "imprecise" ? "\nImprecise (few cases)" : ""}` }));
      const main = rs.find((r) => r.set === "main4" && r.outcome === rs[0].outcome)!, withH = rs.find((r) => r.set === "main4_hpv" && r.outcome === rs[0].outcome)!;
      return figure({
        title: rs[0].subsample_label,
        what: `For ${(outc[rs[0].outcome] ?? "").toLowerCase()}, adding the HPV measure moves the adjusted odds ratio from ${f2(main.or)} to ${f2(withH.or)}.`,
        alt: `Forest plot: ${fr.map((r) => `${r.label.replace("\n", ", ")} ${f2(r.est)} (${f2(r.lcl)}–${f2(r.ucl)})`).join("; ")}`,
        render: (w) => forestPlot(fr, w, { domain: [0.3, 10], marginLeft: 300, narrowLabel: "join" }),
        table: { columns: ["Outcome / model", "OR", "95% CI", "n", "Cases"], rows: rs.map((r) => [`${outc[r.outcome]} — ${setLabel[r.set]}`, f2(r.or), `${f2(r.lcl)}–${f2(r.ucl)}`, int(r.n), int(r.cases)]) },
        notes: [s === "sxq" ? "Lifetime sex partners is a proxy for HPV exposure, not a measure of it." :
          "A single HPV DNA test measures current infection. Most infections clear, and a cancer already diagnosed (and treated) may be long past the infection that caused it, so this is a weak measure of the relevant exposure. A small change here does not show that HPV is not a confounder."],
      });
    }));
  }
  draw();
  return sec;
}

/* ---------------- Prevalence explorer ---------------- */
function prevalenceSection(rows: Proportion[], meta: { measures: Record<string, { label: string }> }, ever: Proportion[], sample: string) {
  const sec = el("section", { class: "section", id: "nhanes-prevalence", "aria-labelledby": "prev-h" },
    el("h3", { id: "prev-h" }, "Who uses cannabis, who smokes, and who reports cancer"),
    el("p", { class: "sub" }, "Weighted prevalence with 95% confidence intervals. Estimates that fail NCHS reliability standards are suppressed."));
  const groupLabels: Record<string, string> = { overall: "Overall", cycle: "Survey cycle", age_grp: "Age group", sex: "Sex", race: "Race and Hispanic origin", mj_ever: "Cannabis use (ever)", smk_status: "Cigarette smoking" };
  const state = { measure: "smk_current", group: "mj_ever" };
  const host = el("div");
  const measureSel = select("Measure", Object.entries(meta.measures).map(([value, m]) => ({ value, label: m.label })), state.measure, (v) => { state.measure = v; draw(); });
  const groupSel = select("Break down by", Object.entries(groupLabels).map(([value, label]) => ({ value, label })), state.group, (v) => { state.group = v; draw(); });
  sec.append(controlRow(measureSel, groupSel), host);
  function draw() {
    const rs = rows.filter((r) => r.measure === state.measure && r.group_var === state.group);
    if (!rs.length) { host.replaceChildren(el("p", { class: "note" }, "This breakdown is not available for this measure (e.g. cannabis measures are not broken down by cannabis use).")); return; }
    const shown = rs.filter((r) => r.status !== "suppress");
    const hi = Math.min(1, Math.max(...shown.map((r) => r.ucl)) * 1.15);
    const label = meta.measures[state.measure].label;
    const top = shown.slice().sort((a, b) => b.p - a.p)[0], bot = shown.slice().sort((a, b) => a.p - b.p)[0];
    host.replaceChildren(figure({
      title: `${label}, by ${groupLabels[state.group].toLowerCase()}`,
      what: shown.length > 1 ? `Highest in ${top.group} (${pct(top.p)}) and lowest in ${bot.group} (${pct(bot.p)}).` : `${pct(shown[0].p)} overall.`,
      alt: `Dot plot with 95% CIs. ${label}: ${rs.map((r) => `${r.group} ${r.status === "suppress" ? "suppressed" : pct(r.p)}`).join(", ")}.`,
      render: (w) => Plot.plot({
        width: w, height: Math.max(150, rs.length * 36 + 60), marginLeft: w < 560 ? 130 : 200, marginRight: 50, marginBottom: 46, style: plotStyle(),
        x: { domain: [0, hi], label: `${label} (%)`, labelAnchor: "center", labelOffset: 38, tickFormat: (d: number) => `${Math.round(d * 100)}`, grid: true },
        y: { domain: rs.map((r) => (state.group === "cycle" && w < 560 ? shortCycle(r.group) : r.group)), label: null, tickSize: 0 },
        marks: [
          Plot.ruleY(shown, { y: (r: Proportion) => (state.group === "cycle" && w < 560 ? shortCycle(r.group) : r.group), x1: "lcl", x2: "ucl", stroke: cssVar("--accent-mark"), strokeWidth: 2 }),
          Plot.dot(shown, { y: (r: Proportion) => (state.group === "cycle" && w < 560 ? shortCycle(r.group) : r.group), x: "p", r: 5, fill: cssVar("--accent-mark"), stroke: cssVar("--surface"), strokeWidth: 2 }),
          Plot.text(shown, { y: (r: Proportion) => (state.group === "cycle" && w < 560 ? shortCycle(r.group) : r.group), x: "ucl", text: (r: Proportion) => pct(r.p), dx: 8, textAnchor: "start", fill: cssVar("--ink-2"), fontSize: 12 }),
          Plot.tip(shown, Plot.pointerY({ y: (r: Proportion) => (state.group === "cycle" && w < 560 ? shortCycle(r.group) : r.group), x: "p", title: (r: Proportion) => `${pct(r.p)} (95% CI ${pct(r.lcl)}–${pct(r.ucl)})\nunweighted n = ${int(r.n)}` })),
        ],
      }),
      table: { columns: ["Group", "Weighted %", "95% CI", "Unweighted n", "Reliability"],
        rows: rs.map((r) => [r.group, r.status === "suppress" ? "—" : pct(r.p), r.status === "suppress" ? "—" : `${pct(r.lcl)}–${pct(r.ucl)}`, int(r.n),
          r.status === "ok" ? "Meets NCHS standards" : `${r.status === "review" ? "Review" : "Suppressed"}: ${r.reason}`]) },
      notes: [`Sample: ${sample}. Regular use is only asked 2009–2018.`, SURVIVORSHIP],
    }));
  }
  draw();
  sec.append(everUseFigure(ever, sample));
  return sec;
}

function tableEl(cols: string[], rows: string[][]) {
  return el("table", { class: "data" }, el("thead", {}, el("tr", {}, ...cols.map((c) => el("th", { scope: "col" }, c)))),
    el("tbody", {}, ...rows.map((r) => el("tr", {}, ...r.map((c, i) => (i === 0 ? el("th", { scope: "row" }, c) : el("td", {}, c)))))));
}

export function everUseFigure(rows: Proportion[], sample: string): HTMLElement {
  const shown = rows.filter((r) => r.status !== "suppress");
  const lo = Math.min(...shown.map((r) => r.p)), hi = Math.max(...shown.map((r) => r.p));
  const allOverlap = Math.max(...shown.map((r) => r.lcl)) <= Math.min(...shown.map((r) => r.ucl));
  const render = (width: number) => {
    const narrow = width < 560;
    return Plot.plot({
      width, height: narrow ? 300 : 340, marginLeft: 44, marginTop: 30, marginRight: 64, marginBottom: width < 480 ? 48 : 40,
      style: plotStyle(),
      x: { label: width < 480 ? "Survey cycle (first year)" : null, labelAnchor: "center", padding: 0.4, tickSize: 0,
           tickFormat: width < 480 ? (c: string) => `’${c.slice(2, 4)}` : narrow ? shortCycle : undefined },
      y: { domain: [0, 1], label: "Ever used marijuana (%)", labelAnchor: "top", tickFormat: (d: number) => `${Math.round(d * 100)}`, grid: true, ticks: 5 },
      marks: [
        Plot.ruleY([0], { stroke: cssVar("--axis") }),
        Plot.ruleX(shown, { x: "group", y1: "lcl", y2: "ucl", stroke: cssVar("--accent-mark"), strokeWidth: 2, strokeLinecap: "round" }),
        Plot.dot(shown, { x: "group", y: "p", r: 5.5, fill: cssVar("--accent-mark"), stroke: cssVar("--surface"), strokeWidth: 2 }),
        Plot.text(shown.slice(-1), { x: "group", y: "p", text: (d: Proportion) => pct(d.p), dx: 12, textAnchor: "start", fill: cssVar("--ink"), fontWeight: 600 }),
        Plot.tip(shown, Plot.pointerX({ x: "group", y: "p", title: (d: Proportion) => `${pct(d.p)}  (95% CI ${pct(d.lcl)}–${pct(d.ucl)})\n${d.group} · unweighted n = ${int(d.n)}` })),
      ],
    });
  };
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
    notes: [`Sample: ${sample}.`, "Korn–Graubard 95% confidence intervals. Cross-checked against Mitchell et al., BMJ Open 2020 (identical to one decimal)."],
  });
}

export { responsive };
