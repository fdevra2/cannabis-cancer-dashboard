import { marked } from "marked";
import methodsMd from "../../../docs/methods.md?raw";
import { el } from "../lib/dom";

// Renders docs/methods.md (a trusted file in this repository) so the site and the repo docs never diverge.
export function renderMethods(root: HTMLElement) {
  const html = marked.parse(methodsMd, { async: false }) as string;
  const article = el("article", { class: "prose methods" });
  article.innerHTML = html;
  article.querySelectorAll("table").forEach((t) => {
    t.classList.add("data");
    const wrap = el("div", { class: "table-wrap" });
    t.replaceWith(wrap);
    wrap.append(t);
  });
  article.querySelectorAll("h1").forEach((h) => {
    const h2 = el("h2", {}, h.textContent ?? "");
    h.replaceWith(h2);
  });
  // link bare DOIs
  article.querySelectorAll("li, p").forEach((n) => {
    n.innerHTML = n.innerHTML.replace(/doi:(10\.[^\s<;,]+[^\s<;,.])/g, '<a href="https://doi.org/$1" target="_blank" rel="noopener">doi:$1</a>');
  });
  root.append(article);
}
