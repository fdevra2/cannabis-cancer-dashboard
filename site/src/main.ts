import "./styles.css";
import { el } from "./lib/dom";
import type { Tab } from "./tabs/registry";
import { placeholder } from "./tabs/placeholder";
import { renderNhanes } from "./tabs/nhanes";
import { renderEvidence } from "./tabs/evidence";
import { renderExposure } from "./tabs/exposure";
import { renderCausal } from "./tabs/causal";
import { renderMethods } from "./tabs/methods";
import { renderPolicy } from "./tabs/policy";
import { renderOverview } from "./tabs/overview";

const TABS: Tab[] = [
  { id: "overview", label: "Overview", render: renderOverview },
  { id: "evidence", label: "Evidence Map", render: renderEvidence },
  { id: "nhanes", label: "NHANES Explorer", render: renderNhanes },
  { id: "exposure", label: "Measuring Exposure", render: renderExposure },
  { id: "causal", label: "Causal Reasoning", render: renderCausal },
  { id: "ai", label: "AI in Health Research", render: (r) => placeholder(r, "AI in Health Research",
      "Two demonstrations, both framed as prediction, not causation.",
      ["Predictive model: AUROC, calibration, subgroup performance, SHAP", "AI-assisted literature triage benchmarked against human labels"]) },
  { id: "policy", label: "Policy Context", render: renderPolicy },
  { id: "methods", label: "Methods & Limitations", render: renderMethods },
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
