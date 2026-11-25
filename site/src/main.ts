import "./styles.css";
import { el } from "./lib/dom";
import type { Tab } from "./tabs/registry";
import { placeholder } from "./tabs/placeholder";
import { renderNhanes } from "./tabs/nhanes";

const TABS: Tab[] = [
  { id: "overview", label: "Overview", render: (r) => placeholder(r, "Overview",
      "Key takeaways in plain language, each linked to the evidence behind it.",
      ["4–5 takeaway cards, each linking to its chart or study"]) },
  { id: "evidence", label: "Evidence Map", render: (r) => placeholder(r, "Evidence Map",
      "Published studies of cannabis use and cancer, by cancer site.",
      ["Forest plot by cancer site with filters (design, tobacco adjustment, year)", "Evidence-grade badge per site", "Every row links to its DOI"]) },
  { id: "nhanes", label: "NHANES Explorer", render: renderNhanes },
  { id: "exposure", label: "Measuring Exposure", render: (r) => placeholder(r, "Measuring Exposure",
      "How the answer depends on how cannabis use is measured.",
      ["Ever use vs. regular use vs. past-30-day frequency vs. a crude joint-year proxy", "Why dose and potency matter"]) },
  { id: "causal", label: "Causal Reasoning", render: (r) => placeholder(r, "Causal Reasoning",
      "Why an association is not the same as a cause.",
      ["Interactive causal diagram", "E-value calculator"]) },
  { id: "ai", label: "AI in Health Research", render: (r) => placeholder(r, "AI in Health Research",
      "Two demonstrations, both framed as prediction, not causation.",
      ["Predictive model: AUROC, calibration, subgroup performance, SHAP", "AI-assisted literature triage benchmarked against human labels"]) },
  { id: "policy", label: "Policy Context", render: (r) => placeholder(r, "Policy Context",
      "Descriptive context: state legalization timeline and THC potency trends.",
      ["Sourced legalization timeline", "Potency trends with sources"]) },
  { id: "methods", label: "Methods & Limitations", render: (r) => placeholder(r, "Methods & Limitations",
      "Data sources, weighting, definitions, exclusions, limitations, and how to reproduce.",
      ["Full methods", "Every limitation", "How to cite and reproduce"]) },
];

const list = document.getElementById("tab-list")!;
const main = document.getElementById("main")!;
for (const t of TABS) list.append(el("li", {}, el("a", { href: `#${t.id}`, "data-tab": t.id }, t.label)));

async function route() {
  const id = location.hash.replace(/^#/, "").split("/")[0] || "overview";
  const tab = TABS.find((t) => t.id === id) ?? TABS[0];
  list.querySelectorAll("a").forEach((a) =>
    a.dataset.tab === tab.id ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  document.title = `${tab.label} · Cannabis & Cancer: What the Evidence Can and Cannot Tell Us`;
  main.replaceChildren();
  try {
    await tab.render(main);
  } catch (err) {
    main.append(el("p", { class: "callout", role: "alert" }, `Could not render this section: ${(err as Error).message}`));
  }
}
window.addEventListener("hashchange", () => { route(); main.focus({ preventScroll: true }); });
route();
