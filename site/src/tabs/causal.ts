import * as Plot from "@observablehq/plot";
import { loadData, type GridRow, type EvidenceRow, type Proportion } from "../lib/data";
import { figure, cssVar, plotStyle } from "../lib/chart";
import { el } from "../lib/dom";
import { evalue, type Measure } from "../lib/evalue";
import { pickedEstimate, type PickedEstimate } from "../lib/store";
import { pct } from "../lib/format";

/* ---------------- Causal diagram ---------------- */
type Role = "exposure" | "outcome" | "confounder" | "mediator" | "selection" | "measurement" | "reverse";
interface Node { id: string; label: string[]; x: number; y: number; role: Role; title: string; body: string; here: string }
const NODES: Node[] = [
  { id: "C", label: ["Cannabis use"], x: 230, y: 250, role: "exposure", title: "Cannabis use (exposure)",
    body: "What we would like to know the effect of: how much cannabis, how often, for how long, and by what route.",
    here: "NHANES only measures ever use, regular use, recent days and joints per day — see Measuring Exposure." },
  { id: "Y", label: ["Cancer"], x: 590, y: 250, role: "outcome", title: "Cancer (outcome)",
    body: "In NHANES: ever being told by a doctor that you had cancer, self-reported.",
    here: "Sensitivity outcomes exclude non-melanoma skin and cervical cancer." },
  { id: "T", label: ["Tobacco"], x: 410, y: 60, role: "confounder", title: "Tobacco smoking (confounder)",
    body: "Tobacco causes many cancers and is far more common among cannabis users; many people smoke both, sometimes in the same joint. Failing to account for it makes cannabis look more harmful than it is.",
    here: "Adjusted as never/former/current smoking. Pack-years are not modelled, so residual confounding by smoking intensity is likely." },
  { id: "A", label: ["Alcohol"], x: 590, y: 110, role: "confounder", title: "Alcohol (confounder)",
    body: "Alcohol causes head-and-neck, esophageal, liver and breast cancers, and drinking is associated with cannabis use.",
    here: "Adjusted as none / moderate / heavy drinking in the past year (definitions changed in 2017–2018)." },
  { id: "H", label: ["HPV /", "sexual behaviour"], x: 760, y: 130, role: "confounder", title: "HPV and sexual behaviour (confounder)",
    body: "HPV causes cervical and many oropharyngeal cancers; number of sex partners is associated both with HPV and with cannabis use.",
    here: "Sensitivity models add lifetime partners or measured oral/vaginal HPV on their own subsamples (NHANES Explorer)." },
  { id: "S", label: ["Socioeconomic", "position"], x: 80, y: 130, role: "confounder", title: "Socioeconomic position (confounder)",
    body: "Education, income and insurance shape smoking, drinking, cannabis use, screening and access to diagnosis.",
    here: "Adjusted for education, income-to-poverty ratio and health insurance." },
  { id: "D", label: ["Age, sex,", "birth cohort"], x: 80, y: 400, role: "confounder", title: "Age, sex and birth cohort (confounders)",
    body: "Cancer risk rises steeply with age, while current cannabis use is concentrated among younger adults; this can hide an association (negative confounding).",
    here: "Adjusted for age, age², sex, race/ethnicity and survey cycle." },
  { id: "R", label: ["Combustion", "(if smoked)"], x: 410, y: 250, role: "mediator", title: "Route of administration (mediator / effect modifier)",
    body: "Smoked cannabis delivers combustion products to the airway; edibles do not. If any causal effect on lung or head-and-neck cancer exists, it may run mainly through smoking.",
    here: "Not measured in NHANES 2005–2018." },
  { id: "M", label: ["Medical cannabis", "after diagnosis"], x: 410, y: 400, role: "reverse", title: "Medical cannabis after diagnosis (reverse causation)",
    body: "A cancer diagnosis can lead people to start or increase cannabis use for nausea, pain, appetite or sleep — so cancer causes cannabis use, not the other way round.",
    here: "Reverse-causation lens: compare age at first/regular use with age at diagnosis; re-estimate excluding post-diagnosis starters." },
  { id: "V", label: ["Alive & able to", "attend exam"], x: 760, y: 400, role: "selection", title: "Survival and participation (selection)",
    body: "NHANES only sees people alive and well enough to attend the exam. Fatal cancers (such as lung) are under-represented, and if cannabis use is related to survival or participation, restricting to participants can create or hide associations (collider bias).",
    here: "Cannot be corrected with NHANES alone; noted on every NHANES chart." },
  { id: "E", label: ["Self-reported", "use (measured)"], x: 230, y: 400, role: "measurement", title: "Self-reported use (measurement)",
    body: "We observe what people report, not what they used. Under-reporting and recall error weaken and can distort associations.",
    here: "Self-administered (ACASI) questions reduce, but do not remove, reporting bias." },
];
const EDGES: [string, string, string?][] = [
  ["C", "R"], ["R", "Y"], ["T", "C"], ["T", "Y"], ["A", "C"], ["A", "Y"], ["H", "Y"], ["H", "C", "assoc"],
  ["S", "C"], ["S", "T"], ["S", "Y"], ["D", "C"], ["D", "Y"], ["Y", "M"], ["M", "C"], ["Y", "V"], ["C", "E"],
];
const ROLE_LABEL: Record<Role, string> = { exposure: "Exposure", outcome: "Outcome", confounder: "Confounder", mediator: "Pathway", selection: "Selection", measurement: "Measurement", reverse: "Reverse causation" };

function dagFigure(): HTMLElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 860 480");
  svg.setAttribute("class", "dag");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Causal diagram. Use Tab to move between factors and Enter to read about each one.");
  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML = `<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>`;
  svg.append(defs);
  const W = 128, H = 50;
  const pos = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const edgeEls: { from: string; to: string; el: SVGLineElement }[] = [];
  for (const [a, b, kind] of EDGES) {
    const p = pos[a], q = pos[b];
    // shorten line to box boundary
    const dx = q.x - p.x, dy = q.y - p.y;
    const t = (n: number) => Math.min((W / 2 + 4) / Math.abs(dx || 1e-9), (H / 2 + 4) / Math.abs(dy || 1e-9), n);
    const s0 = t(0.5), s1 = t(0.5);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", String(p.x + dx * s0)); line.setAttribute("y1", String(p.y + dy * s0));
    line.setAttribute("x2", String(q.x - dx * s1)); line.setAttribute("y2", String(q.y - dy * s1));
    line.setAttribute("class", `edge ${kind ?? ""} from-${a} to-${b}`);
    if (kind !== "assoc") line.setAttribute("marker-end", "url(#arr)");
    else { line.setAttribute("marker-end", "url(#arr)"); line.setAttribute("marker-start", "url(#arr)"); }
    svg.append(line);
    edgeEls.push({ from: a, to: b, el: line });
  }
  const panel = el("div", { class: "card dag-panel", "aria-live": "polite" });
  const nodeEls: SVGGElement[] = [];
  const show = (n: Node) => {
    nodeEls.forEach((g) => g.classList.toggle("active", g.dataset.id === n.id));
    edgeEls.forEach((e) => e.el.classList.toggle("active", e.from === n.id || e.to === n.id));
    panel.replaceChildren(el("span", { class: `badge role-${n.role}` }, ROLE_LABEL[n.role]), el("h3", {}, n.title), el("p", {}, n.body),
      el("p", {}, el("strong", {}, "In this dashboard: "), n.here));
  };
  for (const n of NODES) {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", `node role-${n.role}`);
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", `${n.title}`);
    g.dataset.id = n.id;
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", String(n.x - W / 2)); rect.setAttribute("y", String(n.y - H / 2));
    rect.setAttribute("width", String(W)); rect.setAttribute("height", String(H)); rect.setAttribute("rx", "8");
    g.append(rect);
    n.label.forEach((line, i) => {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", String(n.x)); t.setAttribute("y", String(n.y + (i - (n.label.length - 1) / 2) * 17 + 5));
      t.setAttribute("text-anchor", "middle"); t.textContent = line;
      g.append(t);
    });
    g.addEventListener("click", () => show(n));
    g.addEventListener("focus", () => show(n));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(n); } });
    nodeEls.push(g);
    svg.append(g);
  }
  show(NODES.find((n) => n.id === "T")!);
  const legend = el("div", { class: "legend-inline" },
    ...(["exposure", "outcome", "confounder", "mediator", "reverse", "selection", "measurement"] as Role[]).map((r) =>
      el("span", {}, el("span", { class: `key role-key role-${r}` }), ROLE_LABEL[r])),
  );
  return el("figure", { class: "chart" },
    el("figcaption", {}, el("h3", {}, "Why an association between cannabis and cancer is hard to interpret"),
      el("p", { class: "what" }, el("strong", {}, "What this shows: "), "the main alternative explanations for a cannabis–cancer association; select a factor to see what it does and how this dashboard handles it.")),
    legend,
    el("div", { class: "dag-layout" }, el("div", { class: "dag-wrap" }, svg), panel),
    el("p", { class: "note" }, "A simplified directed acyclic graph (DAG) for discussion, not a complete causal model. Arrows mean “may cause”. The double-headed arrow between HPV/sexual behaviour and cannabis use marks an association through shared causes."));
}

/* ---------------- E-value calculator ---------------- */
interface Preset extends PickedEstimate { key: string }

async function evalueSection(): Promise<HTMLElement> {
  const [grid, evid, prev] = await Promise.all([loadData<GridRow>("models_grid.json"), loadData<EvidenceRow>("evidence.json"), loadData<Proportion>("prevalence.json")]);
  const g = (e: string, b: string, o = "cancer_any") => grid.data.find((r) => r.outcome === o && r.exposure === e && r.sample === "main" && r.blocks === b)!;
  const presets: Preset[] = [];
  const add = (key: string, label: string, r: { est: number; lcl: number; ucl: number }, measure: Measure, source: string) =>
    presets.push({ key, label, est: r.est, lcl: r.lcl, ucl: r.ucl, measure, source });
  const full = "demo+tobacco+alcohol+ses";
  for (const [e, name] of [["x_ever", "ever use"], ["x_regular", "regular use"], ["x_past30", "past-30-day use"], ["x_heavy", "≥20 joint-years"]]) {
    const r = g(e, full); add(`nh-${e}`, `NHANES (this site): ${name} → any cancer, fully adjusted`, { est: r.or, lcl: r.lcl, ucl: r.ucl }, "OR", "NHANES 2005–2018");
  }
  for (const r of evid.data) {
    if (!["L03", "L01", "L06", "H08", "H12", "T02", "T05", "B01", "H04"].includes(r.id)) continue;
    const m: Measure = r.effect_measure.includes("HR") ? "HR" : r.effect_measure.includes("RR") ? "RR" : "OR";
    add(r.id, `${r.study} ${r.year}: ${r.cancer_site}, ${r.exposure_definition}`, { est: r.estimate, lcl: r.lcl, ucl: r.ucl }, m, `doi:${r.doi}`);
  }
  const sec = el("section", { class: "section", id: "causal-evalue", "aria-labelledby": "ev-h" },
    el("h3", { id: "ev-h" }, "E-value calculator"),
    el("p", { class: "sub" },
      "The E-value (VanderWeele & Ding, 2017) is the minimum strength of association — on the risk-ratio scale — that an unmeasured confounder would need with both cannabis use and cancer to fully explain away an observed association, beyond the measured covariates. Small E-values mean little hidden confounding would be needed."),
  );
  const id = (s: string) => `ev-${s}`;
  const presetSel = el("select", { id: id("preset") }, el("option", { value: "" }, "Choose an estimate from this site…"),
    ...presets.map((p) => el("option", { value: p.key }, p.label)));
  const estIn = el("input", { type: "number", id: id("est"), step: "0.01", min: "0.01", value: "1.19" }) as HTMLInputElement;
  const lclIn = el("input", { type: "number", id: id("lcl"), step: "0.01", min: "0.01", value: "0.96" }) as HTMLInputElement;
  const uclIn = el("input", { type: "number", id: id("ucl"), step: "0.01", min: "0.01", value: "1.47" }) as HTMLInputElement;
  const measSel = el("select", { id: id("measure") }, ...["OR", "RR", "HR"].map((m) => el("option", { value: m }, m))) as HTMLSelectElement;
  const common = el("input", { type: "checkbox", id: id("common") }) as HTMLInputElement;
  const src = el("p", { class: "note" });
  const out = el("div", { class: "card", "aria-live": "polite" });
  const chartHost = el("div");
  const form = el("div", { class: "control-row" },
    el("div", { class: "control", style: "flex: 1 1 22rem" }, el("label", { for: id("preset") }, "Start from"), presetSel),
    el("div", { class: "control" }, el("label", { for: id("est") }, "Estimate"), estIn),
    el("div", { class: "control" }, el("label", { for: id("lcl") }, "Lower 95% CI"), lclIn),
    el("div", { class: "control" }, el("label", { for: id("ucl") }, "Upper 95% CI"), uclIn),
    el("div", { class: "control" }, el("label", { for: id("measure") }, "Measure"), measSel),
    el("div", { class: "control checks" }, el("div", { class: "check" }, common, el("label", { for: id("common") }, "Outcome is common (>15%)", el("span", { class: "hint" }, "Only matters for odds ratios")))));
  sec.append(form, src, el("div", { class: "grid-2" }, out, chartHost));

  const load = (p: PickedEstimate) => {
    estIn.value = p.est.toFixed(2); lclIn.value = p.lcl.toFixed(2); uclIn.value = p.ucl.toFixed(2);
    measSel.value = p.measure; common.checked = false; src.textContent = `${p.label} — source: ${p.source}`;
    calc();
  };
  presetSel.addEventListener("change", () => { const p = presets.find((x) => x.key === presetSel.value); if (p) load(p); });
  for (const i of [estIn, lclIn, uclIn, measSel, common]) i.addEventListener("input", () => { src.textContent = "Custom values."; calc(); });

  // Reference: confounder–exposure association for tobacco in NHANES (current smoking by cannabis status)
  const smk = (grp: string) => prev.data.find((r) => r.measure === "smk_current" && r.group_var === "mj_ever" && r.group === grp)!;
  const tobRR = smk("Ever used cannabis").p / smk("Never used cannabis").p;

  function calc() {
    const est = +estIn.value, lcl = lclIn.value ? +lclIn.value : null, ucl = uclIn.value ? +uclIn.value : null;
    if (!(est > 0) || (lcl != null && !(lcl > 0)) || (ucl != null && !(ucl > 0)) || (lcl != null && ucl != null && !(lcl <= est && est <= ucl))) {
      out.replaceChildren(el("p", { class: "callout", role: "alert" }, "Enter a positive estimate with lower ≤ estimate ≤ upper."));
      chartHost.replaceChildren();
      return;
    }
    const r = evalue(est, lcl, ucl, measSel.value as Measure, common.checked);
    out.replaceChildren(
      el("div", { class: "hero" }, el("span", { class: "label" }, "E-value for the estimate"), el("span", { class: "big" }, r.point.toFixed(2)),
        el("span", { class: "ci" }, `for the CI limit closest to 1: ${r.ci.toFixed(2)}`)),
      el("p", {}, r.ciIncludesNull
        ? "The confidence interval already includes 1, so no unmeasured confounding is needed to make it compatible with no association (E-value for the CI = 1)."
        : `To fully explain away the estimate, an unmeasured confounder would need a risk ratio of at least ${r.point.toFixed(2)} with both cannabis use and cancer (beyond the measured covariates); to move the confidence interval to include 1, at least ${r.ci.toFixed(2)}.`),
      el("p", { class: "note" }, `For scale: in NHANES, current cigarette smoking is ${(tobRR).toFixed(1)} times as common among adults who ever used cannabis as among those who never did (${pct(smk("Ever used cannabis").p)} vs ${pct(smk("Never used cannabis").p)}). Tobacco is measured here, but its intensity is not.`),
      el("p", { class: "note" }, measSel.value === "OR" ? (common.checked ? "Odds ratio converted with RR ≈ √OR (common outcome)." : "Odds ratio treated as a risk ratio (rare outcome; cancer history is about 5% in this sample).") : measSel.value === "HR" ? "Hazard ratio treated as a risk ratio (rare outcome)." : ""),
    );
    const rr = r.rrPoint >= 1 ? r.rrPoint : 1 / r.rrPoint;
    if (rr <= 1.0001) { chartHost.replaceChildren(); return; }
    const curve: { x: number; y: number }[] = [];
    for (let x = rr * 1.0005; x <= Math.max(12, r.point * 3); x *= 1.03) {
      const y = (rr * (x - 1)) / (x - rr); // solves x*y/(x+y-1) = rr
      if (y > 0 && y <= Math.max(12, r.point * 3)) curve.push({ x, y });
    }
    const mx = Math.max(12, r.point * 3);
    chartHost.replaceChildren(figure({
      title: "Confounder strengths that would explain away the estimate",
      what: `Any hidden confounder whose two associations fall on or above the curve could fully explain an observed risk ratio of ${rr.toFixed(2)}; the dot marks the E-value (${r.point.toFixed(2)}), where both associations are equal.`,
      alt: `Curve of pairs of confounder–exposure and confounder–outcome risk ratios that would explain away a risk ratio of ${rr.toFixed(2)}; E-value ${r.point.toFixed(2)}.`,
      render: (w) => Plot.plot({
        width: w, height: 300, marginLeft: 52, marginBottom: 46, style: plotStyle(),
        x: { type: "log", domain: [1, mx], label: "Confounder–cannabis association (RR)", labelAnchor: "center", labelOffset: 36, grid: true, tickFormat: (d: number) => `${d}` },
        y: { type: "log", domain: [1, mx], label: "Confounder–cancer association (RR)", labelAnchor: "top", grid: true, tickFormat: (d: number) => `${d}` },
        marks: [
          Plot.areaY(curve, { x: "x", y1: (d) => d.y, y2: mx, fill: cssVar("--series-2"), fillOpacity: 0.08 }),
          Plot.line(curve, { x: "x", y: "y", stroke: cssVar("--series-2"), strokeWidth: 2 }),
          Plot.dot([{ x: r.point, y: r.point }], { x: "x", y: "y", r: 6, fill: cssVar("--accent-mark"), stroke: cssVar("--surface"), strokeWidth: 2 }),
          Plot.text([{ x: r.point, y: r.point }], { x: "x", y: "y", text: () => `E-value ${r.point.toFixed(2)}`, dx: 10, dy: -10, textAnchor: "start", fill: cssVar("--ink"), fontWeight: 600 }),
        ],
      }),
      table: { columns: ["Confounder–cannabis RR", "Confounder–cancer RR needed"], rows: curve.filter((_, i) => i % 8 === 0).map((d) => [d.x.toFixed(2), d.y.toFixed(2)]) },
      notes: ["Shaded region: combinations strong enough to explain away the estimate. Based on the bounding factor RR_EU·RR_UD / (RR_EU + RR_UD − 1) underlying the E-value."],
    }));
  }
  const picked = pickedEstimate.get();
  if (picked) load(picked); else load(presets[0]);
  return sec;
}

export async function renderCausal(root: HTMLElement) {
  root.append(
    el("h2", {}, "Causal Reasoning"),
    el("p", { class: "lede" }, "An association between cannabis and cancer could reflect a causal effect — or confounding, reverse causation, selection or measurement error. Each of these can be drawn, discussed and, sometimes, probed with data."),
    dagFigure(),
    await evalueSection(),
    el("p", { class: "note" }, "Reference: VanderWeele TJ, Ding P. Sensitivity analysis in observational research: introducing the E-value. Ann Intern Med. 2017;167(4):268–274. ",
      el("a", { href: "https://doi.org/10.7326/M16-2607", target: "_blank", rel: "noopener" }, "doi:10.7326/M16-2607")),
  );
  const sub = location.hash.split("/")[1];
  if (sub) requestAnimationFrame(() => document.getElementById(`causal-${sub}`)?.scrollIntoView());
}
