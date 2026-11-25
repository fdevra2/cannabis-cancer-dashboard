import { el } from "./dom";

let uid = 0;
const nextId = (p: string) => `${p}-${++uid}`;

export interface Option { value: string; label: string }

/** Labelled <select>. */
export function select(label: string, options: Option[], value: string, onChange: (v: string) => void): HTMLElement {
  const id = nextId("sel");
  const s = el("select", { id }, ...options.map((o) => {
    const opt = el("option", { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    return opt;
  }));
  s.addEventListener("change", () => onChange(s.value));
  return el("div", { class: "control" }, el("label", { for: id }, label), s);
}

/** Fieldset of checkboxes. */
export function checkboxes(legend: string, options: (Option & { checked: boolean; hint?: string })[],
                           onChange: (values: string[]) => void): HTMLElement {
  const fs = el("fieldset", { class: "control checks" }, el("legend", {}, legend));
  const inputs: HTMLInputElement[] = [];
  for (const o of options) {
    const id = nextId("chk");
    const inp = el("input", { type: "checkbox", id, value: o.value }) as HTMLInputElement;
    inp.checked = o.checked;
    inp.addEventListener("change", () => onChange(inputs.filter((i) => i.checked).map((i) => i.value)));
    inputs.push(inp);
    fs.append(el("div", { class: "check" }, inp, el("label", { for: id }, o.label, o.hint ? el("span", { class: "hint" }, o.hint) : null)));
  }
  return fs;
}

/** Radio group styled as a segmented control. */
export function radios(legend: string, options: Option[], value: string, onChange: (v: string) => void): HTMLElement {
  const name = nextId("rad");
  const fs = el("fieldset", { class: "control segmented" }, el("legend", {}, legend));
  const row = el("div", { class: "seg-row" });
  for (const o of options) {
    const id = nextId("r");
    const inp = el("input", { type: "radio", name, id, value: o.value }) as HTMLInputElement;
    inp.checked = o.value === value;
    inp.addEventListener("change", () => inp.checked && onChange(o.value));
    row.append(inp, el("label", { for: id }, o.label));
  }
  fs.append(row);
  return fs;
}

export const controlRow = (...children: HTMLElement[]) => el("div", { class: "control-row" }, ...children);
