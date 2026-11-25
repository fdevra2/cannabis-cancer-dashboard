// Tiny DOM helpers. Text always goes in via textContent (never innerHTML from data).
type Attrs = Record<string, string | number | boolean | undefined>;
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") e.className = String(v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c != null) e.append(typeof c === "string" ? document.createTextNode(c) : c);
  return e;
}
