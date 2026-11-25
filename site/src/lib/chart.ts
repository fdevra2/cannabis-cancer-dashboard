import { el } from "./dom";

export interface FigureSpec {
  title: string;
  /** One-sentence "what this shows" caption (required on every chart). */
  what: string;
  /** Text alternative describing the chart's main pattern for screen readers. */
  alt: string;
  /** Render the plot at a given pixel width (re-rendered on resize and theme change). */
  render: (width: number) => Element;
  table: { columns: string[]; rows: (string | number)[][] };
  notes?: string[];
}

/** Standard figure: title, what-this-shows caption, plot (role=img + alt), data table, notes. */
export function figure(spec: FigureSpec): HTMLElement {
  const plotWrap = el("div", { class: "plot", role: "img", "aria-label": spec.alt });
  responsive(plotWrap, spec.render);
  const thead = el("thead", {}, el("tr", {}, ...spec.table.columns.map((c) => el("th", { scope: "col" }, c))));
  const tbody = el("tbody", {}, ...spec.table.rows.map((r) =>
    el("tr", {}, ...r.map((c, i) => (i === 0 ? el("th", { scope: "row" }, String(c)) : el("td", {}, String(c)))))));
  const table = el("table", { class: "data" }, el("caption", { class: "visually-hidden" }, spec.title), thead, tbody);
  return el("figure", { class: "chart" },
    el("figcaption", {},
      el("h3", {}, spec.title),
      el("p", { class: "what" }, el("strong", {}, "What this shows: "), spec.what)),
    plotWrap,
    el("details", {}, el("summary", {}, "Show data table"), el("div", { class: "table-wrap" }, table)),
    ...(spec.notes ?? []).map((n) => el("p", { class: "note" }, n)));
}

/** Read a CSS custom property (so charts follow the light/dark tokens). */
export const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/** Render into `host` at its current width; re-render on width or color-scheme change. */
export function responsive(host: HTMLElement, render: (width: number) => Element) {
  let last = -1;
  const draw = (force = false) => {
    const w = Math.max(300, Math.floor(host.clientWidth || 720));
    if (!force && Math.abs(w - last) < 8) return;
    last = w;
    host.replaceChildren(render(w));
  };
  const ro = new ResizeObserver(() => draw());
  ro.observe(host);
  darkQuery.addEventListener("change", () => draw(true));
  requestAnimationFrame(() => draw());
}

/** Shared Plot style so all charts follow the tokens. */
export const plotStyle = () => ({ background: "transparent", color: cssVar("--ink-2"), fontSize: "14px", overflow: "visible" as const });

/** Short cycle label for narrow widths: 2005–2006 -> 2005–06 */
export const shortCycle = (c: string) => c.replace(/^(\d{4})–\d{2}(\d{2})$/, "$1–$2");
