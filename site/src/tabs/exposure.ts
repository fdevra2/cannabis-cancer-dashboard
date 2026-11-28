import * as Plot from "@observablehq/plot";
import { loadData, type Proportion, type GridRow, type DoseRow } from "../lib/data";
import { figure, cssVar, plotStyle } from "../lib/chart";
import { forestPlot, type ForestRow } from "../lib/forest";
import { el } from "../lib/dom";
import { pct, int } from "../lib/format";
import { select, controlRow } from "../lib/controls";

const f2 = (x: number) => x.toFixed(2);

export async function renderExposure(root: HTMLElement) {
  const [prev, grid, dose] = await Promise.all([
    loadData<Proportion>("prevalence.json"), loadData<GridRow>("models_grid.json"), loadData<DoseRow>("models_dose.json")]);
  const outcomes = (grid.meta as unknown as { outcomes: Record<string, string> }).outcomes;
  const exposures = (grid.meta as unknown as { exposures: Record<string, string> }).exposures;

  root.append(
    el("h2", {}, "Measuring Exposure"),
    el("p", { class: "lede" },
      "“Cannabis use” can mean one puff in 1985 or a daily high-potency habit. How exposure is measured changes who counts as exposed, and can change the answer."),
  );

  // 1) Who counts as a user
  const defs = [
    { m: "mj_ever", label: "Ever used" },
    { m: "mj_regular", label: "Ever used monthly for ≥1 year (2009–2018)" },
    { m: "mj_past30", label: "Used in past 30 days" },
    { m: "mj_daily", label: "Used on 20–30 of past 30 days" },
  ].map((d) => ({ ...d, row: prev.data.find((r) => r.measure === d.m && r.group_var === "overall")! }));
  root.append(figure({
    title: "Share of adults counted as “cannabis users” under four definitions",
    what: `The same survey classifies ${pct(defs[0].row.p, 0)} of adults aged 20–59 as users under “ever used”, but only ${pct(defs[3].row.p, 0)} under near-daily use.`,
    alt: "Horizontal bars: " + defs.map((d) => `${d.label} ${pct(d.row.p)}`).join(", "),
    render: (w) => Plot.plot({
      width: w, height: 230, marginLeft: w < 560 ? 150 : 300, marginRight: 60, marginBottom: 44, style: plotStyle(),
      x: { domain: [0, 1], label: "Weighted % of adults 20–59", labelAnchor: "center", labelOffset: 36, tickFormat: (d: number) => `${Math.round(d * 100)}`, grid: true },
      y: { domain: defs.map((d) => d.label), label: null, tickSize: 0 },
      marks: [
        Plot.barX(defs, { y: "label", x: (d) => d.row.p, fill: cssVar("--accent-mark"), rx: 4, insetTop: 6, insetBottom: 6 }),
        Plot.ruleY(defs, { y: "label", x1: (d) => d.row.lcl, x2: (d) => d.row.ucl, stroke: cssVar("--ink"), strokeWidth: 1.5 }),
        Plot.text(defs, { y: "label", x: (d) => d.row.ucl, text: (d) => pct(d.row.p), dx: 8, textAnchor: "start", fill: cssVar("--ink"), fontWeight: 600 }),
        Plot.tip(defs, Plot.pointerY({ y: "label", x: (d) => d.row.p, title: (d) => `${pct(d.row.p)} (95% CI ${pct(d.row.lcl)}–${pct(d.row.ucl)})\nunweighted n = ${int(d.row.n)}` })),
      ],
    }),
    table: { columns: ["Definition", "Weighted %", "95% CI", "n"], rows: defs.map((d) => [d.label, pct(d.row.p), `${pct(d.row.lcl)}–${pct(d.row.ucl)}`, int(d.row.n)]) },
    notes: ["NHANES 2005–2018 (regular use 2009–2018), adults 20–59. Black lines are 95% CIs."],
  }));

  // 2) Same data, different definitions
  const sec2 = el("section", { class: "section" }, el("h3", {}, "Same people, different definitions, different odds ratios"),
    el("p", { class: "sub" }, "Each definition is compared with never-users. Grey: crude. Blue: adjusted for demographics, tobacco, alcohol and socioeconomic factors."));
  const st = { outcome: "cancer_any", dose: "mj_days_cat", set: "all" };
  const defHost = el("div");
  sec2.append(controlRow(select("Outcome", Object.entries(outcomes).map(([value, label]) => ({ value, label })), st.outcome, (v) => { st.outcome = v; drawDefs(); drawDose(); drawJyNote(); })), defHost);
  root.append(sec2);
  function drawDefs() {
    const fr: ForestRow[] = [];
    for (const e of Object.keys(exposures)) for (const b of ["", "demo+tobacco+alcohol+ses"]) {
      const r = grid.data.find((g) => g.outcome === st.outcome && g.exposure === e && g.sample === "main" && g.blocks === b)!;
      fr.push({ key: `${e}-${b}`, label: `${exposures[e].replace(" (vs never)", "")}\n${b ? "Fully adjusted" : "Crude"}`, est: r.or, lcl: r.lcl, ucl: r.ucl, emphasis: !!b,
        tip: `OR ${f2(r.or)} (95% CI ${f2(r.lcl)}–${f2(r.ucl)})\nn = ${int(r.n)}, exposed cases = ${int(r.exp_cases)}` });
    }
    const adj = fr.filter((r) => r.emphasis);
    const lo = adj.reduce((a, b) => (a.est < b.est ? a : b)), hi = adj.reduce((a, b) => (a.est > b.est ? a : b));
    defHost.replaceChildren(figure({
      title: `Odds ratio by exposure definition: ${outcomes[st.outcome].toLowerCase()}`,
      what: `Fully adjusted odds ratios range from ${f2(lo.est)} (${lo.label.split("\n")[0].toLowerCase()}) to ${f2(hi.est)} (${hi.label.split("\n")[0].toLowerCase()}), depending only on how use is defined.`,
      alt: "Forest plot: " + fr.map((r) => `${r.label.replace("\n", ", ")} ${f2(r.est)} (${f2(r.lcl)}–${f2(r.ucl)})`).join("; "),
      render: (w) => forestPlot(fr, w, { domain: [0.5, 5], marginLeft: 330, narrowLabel: "join" }),
      table: { columns: ["Definition / model", "OR", "95% CI"], rows: fr.map((r) => [r.label.replace("\n", " — "), f2(r.est), `${f2(r.lcl)}–${f2(r.ucl)}`]) },
      notes: ["Regular use and ≥20 joint-years are only available 2009–2018, so they use fewer people and have wider intervals. The joint-year proxy is crude: frequency category midpoint × joints per day (“6 or more” counted as 6) × years of regular use."],
    }));
  }

  // 3) Dose-response
  const sec3 = el("section", { class: "section" }, el("h3", {}, "Is there a dose–response gradient?"),
    el("p", { class: "sub" }, "If cannabis caused cancer, heavier or longer use would usually show stronger associations. Each category is compared with never-users."));
  const doseHost = el("div");
  const jyNote = el("div", { class: "caveat", role: "note" });
  sec3.append(controlRow(
    select("Exposure measure", [{ value: "mj_days_cat", label: "Days used in past 30 days" }, { value: "mj_jy_cat", label: "Joint-year proxy, data-driven cut-offs (<5, 5–19.9, ≥20)" }, { value: "mj_jy_lit_cat", label: "Joint-year proxy, literature cut-offs (≥1, ≥10)" }], st.dose, (v) => { st.dose = v; drawDose(); }),
    select("Adjusted for", [{ value: "crude", label: "Nothing (crude)" }, { value: "demo", label: "Demographics" }, { value: "demo_tobacco", label: "Demographics + tobacco" }, { value: "all", label: "All four groups" }], st.set, (v) => { st.set = v; drawDose(); }),
  ), doseHost, jyNote);
  root.append(sec3);
  function drawDose() {
    const rs = dose.data.filter((r) => r.exposure === st.dose && r.outcome === st.outcome && r.set === st.set).sort((a, b) => a.level_order - b.level_order);
    const ref = { level: rs[0] ? (st.dose === "mj_days_cat" ? "Never used" : "Never used") : "", or: 1 };
    const pts = [{ level: ref.level, or: 1, lcl: 1, ucl: 1, ref: true, cases: rs[0]?.ref_cases ?? 0, n: rs[0]?.ref_n ?? 0, flag: "ok" },
      ...rs.map((r) => ({ level: r.level, or: r.or, lcl: r.lcl, ucl: r.ucl, ref: false, cases: r.level_cases, n: r.level_n, flag: r.flag }))];
    const monotone = rs.every((r, i) => i === 0 || r.or >= rs[i - 1].or);
    const allOverlap = Math.max(...rs.map((r) => r.lcl)) <= Math.min(...rs.map((r) => r.ucl));
    doseHost.replaceChildren(figure({
      title: `${st.dose === "mj_days_cat" ? "Days used in past 30 days" : st.dose === "mj_jy_cat" ? "Joint-year proxy (data-driven cut-offs)" : "Joint-year proxy (literature cut-offs)"} and ${outcomes[st.outcome].toLowerCase()}`,
      what: monotone
        ? `Point estimates rise across categories (${rs.map((r) => f2(r.or)).join(" → ")})${allOverlap ? ", but every category’s confidence interval overlaps every other’s, so this is weak evidence of a gradient" : ""}.`
        : `The odds ratios do not rise steadily with heavier use (${rs.map((r) => f2(r.or)).join(", ")}) — no consistent dose–response gradient.`,
      alt: "Dot plot of odds ratios by category: " + pts.map((p) => `${p.level} ${f2(p.or)}${p.ref ? " (reference)" : ` (${f2(p.lcl)}–${f2(p.ucl)})`}`).join("; "),
      render: (w) => Plot.plot({
        width: w, height: 300, marginLeft: 48, marginBottom: w < 700 ? 70 : 50, style: plotStyle(),
        x: { domain: pts.map((p) => p.level), label: null, tickSize: 0, tickRotate: w < 700 ? -20 : 0 },
        y: { type: "log", domain: [0.4, 4], label: "Odds ratio vs never-users (log)", labelAnchor: "top", grid: true, ticks: [0.5, 1, 2, 4], tickFormat: (d: number) => `${d}` },
        marks: [
          Plot.ruleY([1], { stroke: cssVar("--ink-3") }),
          Plot.ruleX(pts.filter((p) => !p.ref), { x: "level", y1: "lcl", y2: "ucl", stroke: cssVar("--accent-mark"), strokeWidth: 2 }),
          Plot.dot(pts, { x: "level", y: "or", r: 5.5, fill: (p) => (p.ref ? cssVar("--surface") : cssVar("--accent-mark")), stroke: (p) => (p.ref ? cssVar("--ink-3") : cssVar("--surface")), strokeWidth: 2 }),
          Plot.tip(pts, Plot.pointerX({ x: "level", y: "or", title: (p) => p.ref ? `Reference group (never used)\nn = ${int(p.n)}, cases = ${int(p.cases)}` : `OR ${f2(p.or)} (95% CI ${f2(p.lcl)}–${f2(p.ucl)})\nn = ${int(p.n)}, cases = ${int(p.cases)}${p.flag === "imprecise" ? "\nImprecise (few cases)" : ""}` })),
        ],
      }),
      table: { columns: ["Category", "OR", "95% CI", "n", "Cases"], rows: pts.map((p) => [p.level, p.ref ? "1 (reference)" : f2(p.or), p.ref ? "—" : `${f2(p.lcl)}–${f2(p.ucl)}`, int(p.n), int(p.cases)]) },
      notes: ["Open circle = reference group (never used). Joint-year categories use 2009–2018 only.",
        ...(st.dose === "mj_jy_cat" ? ["Data-driven cut-offs were chosen from the distribution among regular users in this sample (median 6.3 joint-years); they are not from the literature."] : []),
        ...(st.dose === "mj_jy_lit_cat" ? ["Literature cut-offs: ≥1 joint-year is the “ever use” definition in Ghasemiesfe et al. 2019 (doi:10.1001/jamanetworkopen.2019.16318); ≥10 joint-years is a category used by Zhang et al. 2015 (doi:10.1002/ijc.29036). Ever-users who never used regularly have 0 joint-years and fall in “<1”."] : [])],
    }));
  }
  function drawJyNote() {
    const lv = (e: string) => dose.data.filter((r) => r.exposure === e && r.outcome === st.outcome && r.set === "all").sort((a, b) => a.level_order - b.level_order);
    const mono = (rs: DoseRow[]) => rs.every((r, i) => i === 0 || r.or >= rs[i - 1].or);
    const dd = lv("mj_jy_cat"), lit = lv("mj_jy_lit_cat");
    const fmt = (rs: DoseRow[]) => rs.map((r) => `${r.level.replace(/^Regular, /, "")} ${f2(r.or)}`).join("; ");
    const neither = !mono(dd) && !mono(lit);
    jyNote.replaceChildren(
      el("strong", {}, neither ? "No dose–response gradient in the joint-year ORs. " : "Joint-year ORs: check the gradient carefully. "),
      `Fully adjusted, ${outcomes[st.outcome].toLowerCase()}: data-driven cut-offs ${mono(dd) ? "rise" : "do not rise steadily"} (${fmt(dd)}); literature cut-offs ${mono(lit) ? "rise" : "do not rise steadily"} (${fmt(lit)}). `,
      neither
        ? "If smoked cannabis caused cancer, larger cumulative exposure would usually show stronger associations. The absence of a gradient argues against a strong dose-dependent effect in these data and is more consistent with the overall association reflecting confounding, selection or chance. It cannot rule out an effect: the joint-year proxy is crude (no potency, route or product), heavy use is rare, case numbers per category are small, and cancers in people under 60 may not reflect long-term exposure."
        : "Even where point estimates rise, overlapping confidence intervals and the crude exposure measure mean this is weak evidence of a dose-dependent effect.");
  }
  drawDefs(); drawDose(); drawJyNote();

  // 4) What NHANES cannot measure
  root.append(el("section", { class: "section" },
    el("h3", {}, "What survey questions like NHANES’ miss"),
    el("div", { class: "cards" },
      card("Potency", "NHANES never asks how much THC a product contained. Average potency of DEA-seized cannabis has changed over time (see Policy Context), so “one joint” is not a stable unit. Seized-sample potency does not represent products sold in state-legal markets."),
      card("Route of administration", "Smoking produces combustion products; edibles and many vaporized products do not. For lung and head-and-neck cancer the route may matter as much as the amount, but NHANES 2005–2018 does not record it."),
      card("Quantity per day", "NHANES asks how many joints or pipes per day during regular use (2009–2018 only), not milligrams of THC, and nothing about concentrates, vapes or edibles."),
      card("Timing and change", "One cross-sectional interview cannot reconstruct a lifetime exposure history or show when use started, stopped or increased relative to a diagnosis."),
    ),
    el("p", { class: "prose" },
      "Measuring dose directly is an active research area. The Cannabis Exposure Index (CEI) estimates milligrams of THC per using day from the products, amounts and routes people report. A 2026 test–retest study reported an intraclass correlation of 0.77 for mean mg THC per using day (Hasin et al., ",
      el("a", { href: "https://doi.org/10.1016/j.drugalcdep.2026.113028", target: "_blank", rel: "noopener" }, "Drug Alcohol Depend 2026"),
      "), and a national CEI survey found that both mg THC per using day and use frequency were associated with cannabis use disorder (Borodovsky et al., ",
      el("a", { href: "https://doi.org/10.1016/j.ypmed.2026.108669", target: "_blank", rel: "noopener" }, "Prev Med 2026"),
      "). Measures like these are what cancer studies would need to test dose–response properly."),
  ));
}

function card(title: string, body: string) {
  return el("div", { class: "card" }, el("h3", {}, title), el("p", {}, body));
}
