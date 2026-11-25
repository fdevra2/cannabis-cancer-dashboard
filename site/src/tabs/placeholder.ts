import { el } from "../lib/dom";

export function placeholder(root: HTMLElement, title: string, lede: string, planned: string[]) {
  root.append(
    el("h2", {}, title),
    el("p", { class: "lede" }, lede),
    el("div", { class: "placeholder" },
      el("p", {}, el("strong", {}, "In progress. "), "This tab is being built; nothing here is a finding yet."),
      el("ul", {}, ...planned.map((p) => el("li", {}, p)))));
}
