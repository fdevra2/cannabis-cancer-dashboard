import { loadData, type EvidenceRow, type GradeRow } from "../lib/data";
import { figure, responsive } from "../lib/chart";
import { forestPlot, type ForestRow } from "../lib/forest";
import { el } from "../lib/dom";
import { select, controlRow } from "../lib/controls";

const SITE_ORDER = ["Lung", "Head and neck (incl. oral)", "Testicular germ cell", "Esophageal", "Bladder", "Prostate", "Cervical", "All sites combined"];
const isPooled = (d: string) => /meta-analysis|pooled/i.test(d);
const fmt = (x: number) => (x >= 10 ? x.toFixed(1) : x.toFixed(2));

function gradeClass(g: GradeRow | undefined) {
  if (!g || !g.nasem_conclusion) return "";
  if (/no statistical association/i.test(g.grade_category)) return "grade-null";
  if (/insufficient/i.test(g.grade_category)) return "grade-insuff";
  return "grade-assoc";
}

export async function renderEvidence(root: HTMLElement) {
  const file = await loadData<EvidenceRow>("evidence.json");
  const rows = file.data;
  const grades = (file.meta as unknown as { grades: GradeRow[] }).grades;
  const years = rows.map((r) => r.year);
  const state = { design: "all", tobacco: "all", from: Math.min(...years), to: Math.max(...years) };

  root.append(
    el("h2", {}, "Evidence Map"),
    el("p", { class: "lede" },
      "Published estimates of cannabis use and cancer risk, grouped by cancer site. Each row is one estimate from one study; the badge gives the National Academies’ 2017 evidence grade for that site."),
    el("p", { class: "caveat" },
      "This is a map, not a meta-analysis. Estimates use different exposure definitions (ever use, joint-years, a clinical cannabis-use-disorder diagnosis), comparison groups, effect measures (OR, RR, HR) and adjustment sets, so they should not be averaged by eye. Studies published after 2017 were not graded by the National Academies."),
  );
  const yearOpts = [...new Set(years)].sort().map((y) => ({ value: String(y), label: String(y) }));
  const controls = controlRow(
    select("Study design", [
      { value: "all", label: "All designs" }, { value: "pooled", label: "Meta-analyses & pooled analyses" },
      { value: "cohort", label: "Cohort studies" }, { value: "cc", label: "Case-control studies" }], state.design, (v) => { state.design = v; draw(); }),
    select("Adjusted for tobacco?", [
      { value: "all", label: "All" }, { value: "Y", label: "Yes (adjusted or restricted)" },
      { value: "notY", label: "No / mixed / not reported" }], state.tobacco, (v) => { state.tobacco = v; draw(); }),
    select("Published from", yearOpts, String(state.from), (v) => { state.from = +v; draw(); }),
    select("to", yearOpts, String(state.to), (v) => { state.to = +v; draw(); }),
  );
  const legend = el("div", { class: "legend-inline", "aria-hidden": "true" },
    el("span", {}, el("span", { class: "key diamond" }), "Meta-analysis or pooled analysis"),
    el("span", {}, el("span", { class: "key dot" }), "Single study"),
    el("span", {}, el("span", { class: "key line" }), "95% confidence interval"));
  const status = el("p", { class: "note", role: "status", "aria-live": "polite" });
  const body = el("div");
  root.append(controls, legend, status, body);

  function keep(r: EvidenceRow) {
    if (state.design === "pooled" && !isPooled(r.design)) return false;
    if (state.design === "cohort" && !(/cohort/i.test(r.design) && !isPooled(r.design))) return false;
    if (state.design === "cc" && !(/case-control/i.test(r.design) && !isPooled(r.design))) return false;
    if (state.tobacco === "Y" && r.adjusted_for_tobacco !== "Y") return false;
    if (state.tobacco === "notY" && r.adjusted_for_tobacco === "Y") return false;
    return r.year >= Math.min(state.from, state.to) && r.year <= Math.max(state.from, state.to);
  }

  function draw() {
    const shown = rows.filter(keep);
    status.textContent = `Showing ${shown.length} of ${rows.length} estimates.`;
    body.replaceChildren();
    for (const site of SITE_ORDER) {
      const sr = shown.filter((r) => r.site_group === site);
      const g = grades.find((x) => x.site_group === site);
      const head = el("div", { class: "site-head" }, el("h4", {}, site),
        el("span", { class: `badge ${gradeClass(g)}`, title: g?.quote_header ? `${g.quote_header} ${g.quote_item}` : "" },
          el("span", { class: "dot", "aria-hidden": "true" }), `NASEM 2017: ${g?.grade_short ?? "Not graded"}`));
      if (!sr.length) {
        body.append(el("div", { class: "section" }, head, el("p", { class: "note" }, "No estimates match the current filters.")));
        continue;
      }
      const fr: ForestRow[] = sr.map((r) => ({
        key: r.id,
        label: `${studyLabel(r)}\n${shorten(`${r.cancer_site} · ${r.exposure_definition}`, 46)}`,
        est: r.estimate, lcl: r.lcl, ucl: r.ucl, group: isPooled(r.design) ? "pooled" : "single",
        tip: `${r.effect_measure} ${fmt(r.estimate)} (95% CI ${fmt(r.lcl)}–${fmt(r.ucl)})\n${r.study}, ${r.year}${r.journal ? ` · ${r.journal}` : ""}\n${r.cancer_site}: ${r.exposure_definition} vs ${r.comparison.toLowerCase()}\nTobacco adjusted: ${r.adjusted_for_tobacco} · doi:${r.doi}`,
      }));
      const nHigher = sr.filter((r) => r.direction === "higher risk").length;
      const nLower = sr.filter((r) => r.direction === "lower risk").length;
      const nNull = sr.length - nHigher - nLower;
      const fig = figure({
        title: `${site}: ${sr.length} estimate${sr.length > 1 ? "s" : ""}`,
        what: `${nHigher} estimate${nHigher === 1 ? "" : "s"} with the whole confidence interval above 1, ${nLower} entirely below 1, and ${nNull} whose interval includes 1 (no clear association).`,
        alt: `Forest plot for ${site}. ` + sr.map((r) => `${r.study} ${r.year}, ${r.cancer_site}, ${r.exposure_definition}: ${r.effect_measure} ${fmt(r.estimate)} (${fmt(r.lcl)} to ${fmt(r.ucl)})`).join("; "),
        render: (w) => forestPlot(fr, w, { symbolBy: (r) => (r.group === "pooled" ? "diamond" : "circle") }),
        table: {
          columns: ["Study", "Site", "Design", "Exposure vs comparison", "Estimate (95% CI)", "Tobacco adjusted", "DOI"],
          rows: sr.map((r) => [`${r.study}, ${r.year}`, r.cancer_site, r.design, `${r.exposure_definition} vs ${r.comparison}`,
            `${r.effect_measure} ${fmt(r.estimate)} (${fmt(r.lcl)}–${fmt(r.ucl)})`, r.adjusted_for_tobacco, r.doi]),
        },
        notes: [
          ...(g?.quote_header ? [`NASEM 2017 conclusion ${g.nasem_conclusion}: “${g.quote_header} ${g.quote_item.replace(/ \(\d-\d\)$/, "")}.”`] : []),
          ...uniqueNotes(sr),
        ],
      });
      // DOI links (keyboard-reachable) under each figure
      const links = el("ul", { class: "ref-list" }, ...dedupe(sr).map((r) =>
        el("li", {}, `${r.authors ? r.authors.split(",")[0] + " et al." : r.study} (${r.year}). ${r.title} `,
          el("em", {}, r.journal || ""), ". ", el("a", { href: `https://doi.org/${r.doi}`, target: "_blank", rel: "noopener" }, `doi:${r.doi}`))));
      body.append(el("div", { class: "section" }, head, fig, el("details", {}, el("summary", {}, "References for this site"), links)));
    }
  }
  draw();
}

/** "Karimi et al. (meta-analysis, cohort studies)" -> "Karimi et al. 2026 (cohort studies)" */
const studyLabel = (r: EvidenceRow) => {
  const m = r.study.match(/^(.*?)(?: \((.*)\))?$/)!;
  const sub = (m[2] ?? "").replace(/^meta-analysis,?\s*/, "").replace(/^(ILCCO pooled|Maghreb pooled|Kaiser Permanente|California Men's Health Study)$/, "");
  return `${m[1]} ${r.year}${sub ? ` (${sub})` : ""}`;
};

const shorten = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

/** One note per study (drops cross-references like "See H08 note"). */
function uniqueNotes(rs: EvidenceRow[]) {
  const out = new Map<string, string>();
  for (const r of rs) {
    if (!r.notes || /^See [A-Z]\d+ note/.test(r.notes)) continue;
    const k = studyLabel(r);
    out.set(k, out.has(k) ? `${out.get(k)} ${r.notes}` : r.notes);
  }
  return [...out].map(([k, v]) => `${k}: ${v}`);
}

function dedupe(rs: EvidenceRow[]) {
  const seen = new Set<string>();
  return rs.filter((r) => (seen.has(r.doi) ? false : (seen.add(r.doi), true)));
}

export { responsive };
