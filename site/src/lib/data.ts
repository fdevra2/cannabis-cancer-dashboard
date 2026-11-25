// Typed access to pipeline outputs in public/data (written by analysis/R).
export interface Meta {
  title?: string;
  sample?: string;
  design?: string;
  reliability?: string;
  source_files?: string;
  [k: string]: unknown;
}
export interface DataFile<T> { meta: Meta; data: T[] }

/** One proportion with NCHS reliability fields (see analysis/R/design.R::nchs_proportion). */
export interface Proportion {
  measure: string;
  group_var: string;
  group: string;
  p: number;
  se: number;
  lcl: number;
  ucl: number;
  n: number;
  events: number;
  n_eff: number;
  df: number;
  ciw: number;
  rciw: number;
  status: "ok" | "review" | "suppress";
  reason: string;
}

const cache = new Map<string, Promise<unknown>>();

export function loadData<T>(name: string): Promise<DataFile<T>> {
  if (!cache.has(name)) {
    const url = new URL(`data/${name}`, document.baseURI).toString();
    cache.set(name, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${name} (${r.status})`);
      return r.json();
    }));
  }
  return cache.get(name) as Promise<DataFile<T>>;
}
