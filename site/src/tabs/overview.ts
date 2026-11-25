import { loadData, type Proportion, type GridRow, type EvidenceRow, type GradeRow, type TimingRow, type DoseRow, type PirRow } from "../lib/data";
import { el } from "../lib/dom";
import { pct } from "../lib/format";
import { SURVIVORSHIP } from "./nhanes";

const f2 = (x: number) => x.toFixed(2);
/** The headline estimate string, identical wherever it appears (README, methods, PROGRESS are checked by test-headline.R). */
export const headline = (r: { or: number; lcl: number; ucl: number }) => `OR ${f2(r.or)} (95% CI ${f2(r.lcl)}–${f2(r.ucl)})`;

// Every number on this page is computed from the pipeline outputs at load time.
export async function renderOverview(root: HTMLElement) {
  const [ev, prev, grid, rc, dose] = await Promise.all([
    loadData<EvidenceRow>("evidence.json"), loadData<Proportion>("prevalence.json"),
    loadData<GridRow>("models_grid.json"), loadData<TimingRow>("reverse_causation.json"), loadData<DoseRow>("models_dose.json")]);
  const pir = await loadData<PirRow>("models_pir.json");
  const pirM = pir.data.find((r) => r.exposure === "x_ever" && r.outcome === "cancer_any" && r.approach === "missing_category")!;
  const doseLevels = (e: string) => dose.data.filter((r) => r.exposure === e && r.outcome === "cancer_any" && r.set === "all").sort((a, b) => a.level_order - b.level_order);
  const monotone = (rs: DoseRow[]) => rs.every((r, i) => i === 0 || r.or >= rs[i - 1].or);
  const jy = doseLevels("mj_jy_cat"), days = doseLevels("mj_days_cat");
  const doseText = `In NHANES, fully adjusted odds ratios ${monotone(jy) ? "rise" : "do not rise consistently"} across joint-year categories (${jy.map((r) => f2(r.or)).join(", ")}) and ${monotone(days) ? "rise only modestly" : "do not rise consistently"} across days used (${days.map((r) => f2(r.or)).join(", ")}), with overlapping confidence intervals.`;
  const grades = (ev.meta as unknown as { grades: GradeRow[] }).grades;
  const dir = (d: string) => ev.data.filter((r) => r.direction === d).length;
  const g = (site: string) => grades.find((x) => x.site_group === site)!;
  const P = (m: string, gv: string, grp: string) => prev.data.find((r) => r.measure === m && r.group_var === gv && r.group === grp)!;
  const M = (e: string, b: string, s = "main", o = "cancer_any") => grid.data.find((r) => r.outcome === o && r.exposure === e && r.sample === s && r.blocks === b)!;
  const full = "demo+tobacco+alcohol+ses";
  const after = rc.data.find((r) => r.measure === "first_use_timing" && r.group === "After diagnosis")!;
  const anyCases = M("x_ever", "", "main", "cancer_any");

  root.append(
    el("h2", {}, "Overview"),
    el("p", { class: "lede" },
      "Does cannabis use cause cancer? The honest answer is that current evidence cannot say with confidence. This dashboard shows why — using published studies and U.S. national survey data — so you can see what each kind of evidence can and cannot tell us."),
  );
  const cards = el("div", { class: "cards" },
    card("1. The published evidence is mixed",
      `Across ${ev.data.length} verified published estimates, ${dir("positive association")} show a positive association (confidence interval above 1), ${dir("inverse association")} an inverse association, and ${dir("no clear association")} no clear association. The National Academies (2017) found ${g("Lung").grade_category.toLowerCase()} for lung and head-and-neck cancer, and ${g("Testicular germ cell").grade_category.toLowerCase()} for testicular cancer.`,
      "#evidence", "See the Evidence Map"),
    card("2. Tobacco is a major confounder",
      `In NHANES, ${pct(P("smk_current", "mj_ever", "Ever used cannabis").p)} of adults who ever used cannabis currently smoke cigarettes, versus ${pct(P("smk_current", "mj_ever", "Never used cannabis").p)} of never-users. Adjusted only for demographics, the odds ratio for ever-use and any cancer is ${f2(M("x_ever", "demo").or)} (95% CI ${f2(M("x_ever", "demo").lcl)}–${f2(M("x_ever", "demo").ucl)}). After accounting for smoking, alcohol and socioeconomic factors it is ${headline(M("x_ever", full))}: no clear association. This depends on how missing income data are handled: keeping those ${pirM.n_pir_missing.toLocaleString("en-US")} people as a separate category gives ${f2(pirM.or)} (95% CI ${f2(pirM.lcl)}–${f2(pirM.ucl)}).`,
      "#nhanes/toggle", "Try the confounding toggle"),
    card("3. Cancer can lead to cannabis use",
      `${pct(after.p)} of cancer survivors who ever used cannabis first tried it after their diagnosis. Excluding them moves the fully adjusted odds ratio from ${f2(M("x_ever", full).or)} to ${f2(M("x_ever", full, "excl_after").or)} (95% CI ${f2(M("x_ever", full, "excl_after").lcl)}–${f2(M("x_ever", full, "excl_after").ucl)}); first-use dates cannot capture people who increased use after diagnosis.`,
      "#nhanes/reverse", "Open the reverse-causation lens"),
    card("4. How use is measured changes the answer",
      `“Ever used” covers ${pct(P("mj_ever", "overall", "All").p, 0)} of adults aged 20–59; near-daily use covers ${pct(P("mj_daily", "overall", "All").p, 0)}. Surveys rarely capture potency, route or milligrams of THC. ${doseText}`,
      "#exposure", "Compare exposure definitions"),
    card("5. Snapshots of survivors can’t settle causation",
      `NHANES is one cross-sectional, self-reported interview with only ${anyCases.cases.toLocaleString("en-US")} cancer histories in the modelled sample, mostly survivors of less lethal cancers. Association is not causation; the E-value shows how little hidden confounding could explain the estimates.`,
      "#causal", "Explore causal reasoning"),
  );
  root.append(cards,
    el("p", { class: "caveat" }, el("strong", {}, "Read every NHANES number with this in mind. "), SURVIVORSHIP),
    el("p", { class: "note prose" }, "Independent student project by Dev Raj (MS Health Data Science, Dartmouth); not an official Dartmouth product. All NHANES estimates are design-based (MEC weights, strata and PSUs) with 95% confidence intervals; every published number is linked to its DOI and checked against the source text. See ",
      el("a", { href: "#methods" }, "Methods & Limitations"), "."));
}

function card(title: string, body: string, href: string, linkText: string) {
  return el("article", { class: "card" }, el("h3", {}, title), el("p", {}, body), el("a", { class: "more", href }, `${linkText} →`));
}
