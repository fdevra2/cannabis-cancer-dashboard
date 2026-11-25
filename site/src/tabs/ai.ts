import * as Plot from "@observablehq/plot";
import { loadData } from "../lib/data";
import { figure, cssVar, plotStyle } from "../lib/chart";
import { forestPlot, type ForestRow } from "../lib/forest";
import { el } from "../lib/dom";
import { pct, int } from "../lib/format";

interface Perf { model: string; auroc: number; auroc_lcl: number; auroc_ucl: number; brier: number; cal_slope: number; cal_intercept: number; mean_pred: number; obs_rate: number }
interface Cal { model: string; pred: number; obs: number; n: number }
interface Sub { dimension: string; group: string; model: string; n: number; cases: number; auroc: number | null; auroc_lcl: number | null; auroc_ucl: number | null; pred_rate: number; obs_rate: number; note: string }
interface Shap { feature: string; label: string; mean_abs_shap: number }
interface PredictData { performance: Perf[]; calibration: Cal[]; subgroups: Sub[]; shap: Shap[]; sizes: { split: string; n: number; cases: number }[]; lr_mj: { or: number }[] }
interface Kappa { kappa: number; lcl: number; ucl: number; agreement: number; n: number; confusion: { Var1: string; Var2: string; n: number }[] }
interface TriageData {
  counts_by_year: { year: number; n: number }[]; design_counts: { label: string; n: number }[]; site_counts: { label: string; n: number }[];
  benchmark: { status: string; message?: string; n_labeled?: number; design?: Kappa; site?: Kappa; llm?: { model: string[]; n_missing: number; design?: Kappa; site?: Kappa } };
}
interface TriageMeta { query: string; retrieved_utc: string; n_records: number; n_with_abstract: number; email_supplied: boolean;
  design_rules: { label: string; publication_types: string; keywords: string }[]; site_rules: { label: string; keywords: string }[] }

const f3 = (x: number) => x.toFixed(3);
const MODEL_COLOR = () => ({ "Logistic regression": cssVar("--accent-mark"), "Gradient boosting (xgboost)": cssVar("--series-2") }) as Record<string, string>;

export async function renderAI(root: HTMLElement) {
  const [pred, tri] = await Promise.all([loadData<unknown>("ai_predict.json"), loadData<unknown>("ai_triage.json")]);
  const P = pred.data as unknown as PredictData;
  const T = tri.data as unknown as TriageData;
  const TM = tri.meta as unknown as TriageMeta;

  root.append(
    el("h2", {}, "AI in Health Research"),
    el("p", { class: "lede" }, "Two demonstrations of machine learning in cannabis–cancer research. Both are about prediction and classification — neither can tell us whether cannabis causes cancer."),
    el("p", { class: "caveat" }, el("strong", {}, "Prediction ≠ causation. "), "A model can predict who reports cancer very well using features that do not cause cancer (age, for example, or factors linked to survival and diagnosis). Importance scores describe the model, not the world."),
  );

  /* -------- (a) Predictive model -------- */
  const secA = el("section", { class: "section" }, el("h3", {}, "A. Predicting self-reported cancer history from NHANES"),
    el("p", { class: "sub" }, `Logistic regression versus gradient boosting (xgboost), trained on 2005–2014 (n = ${int(P.sizes[0].n)}, ${int(P.sizes[0].cases)} cases) and tested on 2015–2018 (n = ${int(P.sizes[1].n)}, ${int(P.sizes[1].cases)} cases). Survey weights are used in fitting and in every metric.`));
  const colors = MODEL_COLOR();
  secA.append(el("div", { class: "grid-2" }, ...P.performance.map((p) => el("div", { class: "card" },
    el("div", { class: "hero" }, el("span", { class: "label" }, `${p.model} · test-set AUROC`), el("span", { class: "big" }, p.auroc.toFixed(2)),
      el("span", { class: "ci" }, `95% CI ${p.auroc_lcl.toFixed(2)}–${p.auroc_ucl.toFixed(2)}`)),
    el("div", { class: "stat-row" },
      el("span", {}, "Calibration slope ", el("strong", {}, p.cal_slope.toFixed(2))),
      el("span", {}, "Brier ", el("strong", {}, f3(p.brier))),
      el("span", {}, "Mean predicted ", el("strong", {}, pct(p.mean_pred)), ` vs observed ${pct(p.obs_rate)}`))))));
  const better = P.performance.slice().sort((a, b) => b.auroc - a.auroc);
  secA.append(el("p", { class: "note prose" },
    `${better[0].model} has the higher AUROC (${better[0].auroc.toFixed(3)} vs ${better[1].auroc.toFixed(3)}), but the confidence intervals overlap: the more complex model does not clearly outperform the simpler one here. AUROC CIs come from a cluster bootstrap over survey PSUs.`));

  // Calibration
  const cal = P.calibration;
  const mx = Math.max(...cal.map((c) => Math.max(c.pred, c.obs))) * 1.1;
  secA.append(figure({
    title: "Calibration: predicted vs observed cancer history (test set, deciles)",
    what: `Points near the diagonal mean predicted risks match observed rates; calibration slopes are ${P.performance.map((p) => `${p.cal_slope.toFixed(2)} (${p.model.split(" ")[0].toLowerCase()})`).join(" and ")}, where 1 is ideal and values below 1 mean predictions are too spread out.`,
    alt: "Calibration plot of predicted vs observed proportion with cancer history by decile of predicted risk for two models.",
    render: (w) => Plot.plot({
      width: Math.min(w, 620), height: Math.min(w, 620) * 0.8, marginLeft: 52, marginBottom: 46, style: plotStyle(),
      x: { domain: [0, mx], label: "Mean predicted risk (%)", labelAnchor: "center", labelOffset: 36, tickFormat: (d: number) => `${Math.round(d * 100)}`, grid: true },
      y: { domain: [0, mx], label: "Observed (%)", labelAnchor: "top", tickFormat: (d: number) => `${Math.round(d * 100)}`, grid: true },
      color: { domain: Object.keys(colors), range: Object.values(colors), legend: true },
      marks: [
        Plot.line([[0, 0], [mx, mx]], { stroke: cssVar("--ink-3"), strokeDasharray: "0" }),
        Plot.line(cal, { x: "pred", y: "obs", stroke: "model", strokeWidth: 2 }),
        Plot.dot(cal, { x: "pred", y: "obs", fill: "model", r: 4.5, stroke: cssVar("--surface"), strokeWidth: 2 }),
        Plot.tip(cal, Plot.pointer({ x: "pred", y: "obs", title: (c: Cal) => `${c.model}\npredicted ${pct(c.pred)}, observed ${pct(c.obs)}\nn = ${int(c.n)}` })),
      ],
    }),
    table: { columns: ["Model", "Mean predicted", "Observed", "n"], rows: cal.map((c) => [c.model, pct(c.pred), pct(c.obs), int(c.n)]) },
    notes: ["Grey line = perfect calibration. Observed rates are survey-weighted."],
  }));

  // Subgroups
  const sub = P.subgroups.filter((s) => s.auroc != null);
  const fr: ForestRow[] = sub.map((s) => ({ key: `${s.dimension}-${s.group}-${s.model}`, label: `${s.dimension}: ${s.group}\n${s.model}`, est: s.auroc!, lcl: s.auroc_lcl ?? s.auroc!, ucl: s.auroc_ucl ?? s.auroc!,
    emphasis: s.model.startsWith("Logistic"), tip: `AUROC ${f3(s.auroc!)} (95% CI ${s.auroc_lcl?.toFixed(2)}–${s.auroc_ucl?.toFixed(2)})\n${s.dimension}: ${s.group} · ${s.model}\nn = ${int(s.n)}, cases = ${s.cases}\npredicted ${pct(s.pred_rate)} vs observed ${pct(s.obs_rate)}` }));
  const minCases = Math.min(...sub.map((s) => s.cases));
  secA.append(figure({
    title: "Does the model work equally well for everyone? AUROC by subgroup",
    what: `Subgroup AUROCs range from ${Math.min(...sub.map((s) => s.auroc!)).toFixed(2)} to ${Math.max(...sub.map((s) => s.auroc!)).toFixed(2)}, but some groups have as few as ${minCases} cases, so their intervals are wide and differences between groups are uncertain.`,
    alt: "Forest plot of AUROC with bootstrap 95% CIs by sex, race/ethnicity and age group for two models.",
    render: (w) => forestPlot(fr, w, { domain: [0.4, 1], marginLeft: 320, narrowLabel: "join", ref: 0.5, xLabel: "AUROC (log scale; line at 0.5 = chance, 1 = perfect)" }),
    table: { columns: ["Subgroup", "Model", "n", "Cases", "AUROC (95% CI)", "Predicted", "Observed"],
      rows: P.subgroups.map((s) => [`${s.dimension}: ${s.group}`, s.model, int(s.n), s.cases, s.auroc == null ? s.note : `${f3(s.auroc)} (${s.auroc_lcl?.toFixed(2)}–${s.auroc_ucl?.toFixed(2)})`, pct(s.pred_rate), pct(s.obs_rate)]) },
    notes: ["Blue = logistic regression; grey = gradient boosting. Fairness here means comparable discrimination and calibration across groups. AUROC within an age band is lower because age, the strongest predictor, varies less inside it."],
  }));

  // SHAP
  const shap = P.shap;
  const mjRank = shap.findIndex((s) => s.feature === "mj_ever") + 1;
  secA.append(figure({
    title: "Which features does the gradient-boosting model rely on? (mean |SHAP|)",
    what: `Age dominates; ever-use of cannabis ranks ${mjRank} of ${shap.length} features. Neither ranking says what would happen to anyone’s cancer risk if they changed that feature.`,
    alt: "Horizontal bars of mean absolute SHAP value by feature: " + shap.map((s) => `${s.label} ${s.mean_abs_shap.toFixed(3)}`).join(", "),
    render: (w) => Plot.plot({
      width: w, height: shap.length * 30 + 50, marginLeft: w < 560 ? 150 : 200, marginRight: 50, marginBottom: 44, style: plotStyle(),
      x: { label: "Mean |SHAP| (log-odds), test set", labelAnchor: "center", labelOffset: 36, grid: true },
      y: { domain: shap.map((s) => s.label), label: null, tickSize: 0 },
      marks: [
        Plot.barX(shap, { y: "label", x: "mean_abs_shap", fill: (s: Shap) => (s.feature.startsWith("mj_") ? cssVar("--series-2") : cssVar("--muted-mark")), rx: 4, insetTop: 5, insetBottom: 5 }),
        Plot.text(shap, { y: "label", x: "mean_abs_shap", text: (s: Shap) => s.mean_abs_shap.toFixed(3), dx: 6, textAnchor: "start", fill: cssVar("--ink-2"), fontSize: 12 }),
      ],
    }),
    table: { columns: ["Feature", "Mean |SHAP|"], rows: shap.map((s) => [s.label, f3(s.mean_abs_shap)]) },
    notes: ["Orange = cannabis features. TreeSHAP values from xgboost, summed across a feature’s categories."],
  }));
  secA.append(el("div", { class: "cards" },
    el("div", { class: "card" }, el("h3", {}, "Why SHAP importance for cannabis is not a causal effect"),
      el("p", {}, "SHAP splits a model’s prediction among its inputs. A feature earns importance if it helps predict the outcome — including through correlation with true causes (tobacco, age, HPV), with who gets diagnosed, or with who survives to be surveyed."),
      el("p", {}, "Correlated features share or steal credit: if cannabis and smoking travel together, the model can lean on either. And SHAP has no notion of intervention — it never asks what happens if someone stops using cannabis.")),
    el("div", { class: "card" }, el("h3", {}, "What a predictive model is good for"),
      el("p", {}, "Prediction is useful for targeting screening or outreach, flagging records, or checking data quality — tasks where knowing who is more likely to have an outcome matters more than knowing why. Causal questions need causal designs (and the confounding, reverse-causation and measurement checks elsewhere on this site)."))));
  root.append(secA);

  /* -------- (b) Literature triage -------- */
  const secB = el("section", { class: "section" }, el("h3", {}, "B. AI-assisted literature triage"),
    el("p", { class: "sub" }, `Retrieve cannabis-and-cancer abstracts from PubMed, classify each one’s study design and cancer site automatically, and check the classifier against human expert labels — the same AI-versus-human benchmarking logic used to evaluate any automated tool. ${int(TM.n_records)} records retrieved (${int(TM.n_with_abstract)} with abstracts) on ${TM.retrieved_utc.slice(0, 10)}.`));
  const counts = T.counts_by_year.filter((c) => c.year >= 1990);
  const peak = counts.reduce((a, b) => (a.n > b.n ? a : b));
  secB.append(figure({
    title: "PubMed records matching the cannabis–cancer search, by publication year",
    what: `Publications grew from ${counts.find((c) => c.year === 2000)!.n} in 2000 to ${counts.find((c) => c.year === 2015)!.n} in 2015 and peaked at ${peak.n} in ${peak.year}.`,
    alt: "Bar chart of PubMed records per year, 1990–2025: " + counts.filter((c) => c.year % 5 === 0).map((c) => `${c.year}: ${c.n}`).join(", "),
    render: (w) => Plot.plot({
      width: w, height: 260, marginLeft: 44, marginBottom: 36, style: plotStyle(),
      x: { label: null, tickFormat: (d: number) => `${d}`, interval: 1, ticks: w < 560 ? 4 : 8 },
      y: { label: "Records", labelAnchor: "top", grid: true },
      marks: [
        Plot.barY(counts, { x: "year", y: "n", fill: cssVar("--accent-mark"), rx: 2, insetLeft: 1, insetRight: 1 }),
        Plot.tip(counts, Plot.pointerX({ x: "year", y: "n", title: (c: { year: number; n: number }) => `${c.year}: ${c.n} records` })),
      ],
    }),
    table: { columns: ["Year", "Records"], rows: counts.map((c) => [c.year, c.n]) },
    notes: [`Query (PubMed, NCBI E-utilities): ${TM.query}`, "Counts reflect indexing and the search terms, not just research activity."],
  }));
  const bars = (data: { label: string; n: number }[], title: string, what: string) => figure({
    title, what, alt: `${title}: ` + data.map((d) => `${d.label} ${d.n}`).join(", "),
    render: (w) => Plot.plot({
      width: w, height: data.length * 28 + 40, marginLeft: w < 560 ? 200 : 260, marginRight: 50, style: plotStyle(),
      x: { label: null, grid: true }, y: { domain: data.map((d) => d.label), label: null, tickSize: 0 },
      marks: [Plot.barX(data, { y: "label", x: "n", fill: cssVar("--accent-mark"), rx: 4, insetTop: 5, insetBottom: 5 }),
              Plot.text(data, { y: "label", x: "n", text: (d: { n: number }) => String(d.n), dx: 6, textAnchor: "start", fill: cssVar("--ink-2"), fontSize: 12 })],
    }),
    table: { columns: ["Label", "Records"], rows: data.map((d) => [d.label, d.n]) },
    notes: ["Rule-based predictions — not yet checked against human labels."],
  });
  secB.append(el("div", {},
    bars(T.design_counts, "Predicted study design (rule-based)", `The rules label ${T.design_counts[0].n} records “${T.design_counts[0].label}”, the most common prediction.`),
    bars(T.site_counts, "Predicted cancer site (rule-based)", `${T.site_counts[0].n} records are labelled “${T.site_counts[0].label}”.`)));

  // Rules
  secB.append(el("details", { class: "chart" }, el("summary", {}, "Show the classification rules (fully transparent baseline)"),
    el("p", { class: "note" }, "Design: the first rule whose PubMed publication type or title/abstract keyword pattern matches wins. Site: one matching site → that site; several → “Multiple sites”; none → “Cancer in general / unspecified”."),
    el("div", { class: "table-wrap" }, el("table", { class: "data" }, el("thead", {}, el("tr", {}, ...["Order", "Design label", "Publication types", "Keywords (regex)"].map((c) => el("th", { scope: "col" }, c)))),
      el("tbody", {}, ...TM.design_rules.map((r, i) => el("tr", {}, el("th", { scope: "row" }, String(i + 1)), el("td", {}, r.label), el("td", {}, r.publication_types === "$^" ? "—" : r.publication_types), el("td", {}, el("code", {}, r.keywords))))))),
    el("div", { class: "table-wrap" }, el("table", { class: "data" }, el("thead", {}, el("tr", {}, ...["Site label", "Keywords (regex)"].map((c) => el("th", { scope: "col" }, c)))),
      el("tbody", {}, ...TM.site_rules.map((r) => el("tr", {}, el("th", { scope: "row" }, r.label), el("td", {}, el("code", {}, r.keywords)))))))));

  // Benchmark
  const b = T.benchmark;
  // The human-benchmark panel is shown only once real human labels exist (data/labels/validation_labels.csv).
  if (b.status === "complete") {
    for (const [name, k] of [["Study design (rules)", b.design], ["Cancer site (rules)", b.site], ["Study design (LLM)", b.llm?.design], ["Cancer site (LLM)", b.llm?.site]] as [string, Kappa | undefined][]) {
      if (!k) continue;
      secB.append(figure({
        title: `${name}: classifier vs human labels`,
        what: `Cohen’s kappa ${k.kappa.toFixed(2)} (95% CI ${k.lcl.toFixed(2)}–${k.ucl.toFixed(2)}); raw agreement ${pct(k.agreement)} on ${k.n} abstracts.`,
        alt: `Confusion matrix heatmap for ${name}.`,
        render: (w) => Plot.plot({
          width: w, height: 420, marginLeft: 220, marginBottom: 140, style: plotStyle(),
          x: { label: "Classifier", tickRotate: -35 }, y: { label: "Human", labelAnchor: "top" },
          color: { type: "linear", range: [cssVar("--surface"), cssVar("--accent-mark")], legend: true, label: "Abstracts" },
          marks: [Plot.cell(k.confusion, { x: "Var2", y: "Var1", fill: "n", inset: 1 }), Plot.text(k.confusion.filter((c) => c.n > 0), { x: "Var2", y: "Var1", text: "n", fill: cssVar("--ink") })],
        }),
        table: { columns: ["Human", "Classifier", "n"], rows: k.confusion.map((c) => [c.Var1, c.Var2, c.n]) },
      }));
    }
  }
  if (b.status === "complete") secB.append(el("p", { class: "note prose" },
    "Optional LLM classifier: analysis/R/ai_triage_llm.R classifies the same 200 abstracts with Claude (structured JSON output constrained to the labelling guide’s categories) when an API key is provided."));
  root.append(secB);
}
