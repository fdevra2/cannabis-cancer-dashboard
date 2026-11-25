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

export interface GridRow {
  outcome: string; exposure: string; sample: string; blocks: string; n_blocks: number;
  or: number; lcl: number; ucl: number; log_or: number; se: number; df: number;
  n: number; cases: number; exp_cases: number; unexp_cases: number; exp_n: number; unexp_n: number;
  flag: "ok" | "imprecise";
}
export interface HpvRow {
  subsample: string; subsample_label: string; outcome: string; exposure: string; set: string;
  or: number; lcl: number; ucl: number; df: number; n: number; cases: number; exp_cases: number; unexp_cases: number;
  flag: "ok" | "imprecise";
}
export interface DoseRow {
  exposure: string; outcome: string; set: string; level: string; level_order: number;
  or: number; lcl: number; ucl: number; df: number; n: number; level_n: number; level_cases: number;
  ref_n: number; ref_cases: number; flag: "ok" | "imprecise";
}
export interface TimingRow extends Proportion { count: number | null }
export interface EvidenceRow {
  id: string; site_group: string; cancer_site: string; study: string; year: number; design: string; population: string;
  exposure_definition: string; comparison: string; effect_measure: string; estimate: number; lcl: number; ucl: number;
  direction: string; adjusted_for_tobacco: string; adjustment_notes: string; evidence_grade: string; doi: string;
  source_text: string; quote: string; status: string; notes: string; journal: string; authors: string; title: string;
}
export interface GradeRow { site_group: string; nasem_conclusion: string; grade_category: string; grade_short: string; quote_header: string; quote_item: string; doi: string }

export interface PirRow { exposure: string; outcome: string; approach: "complete_case" | "missing_category"; or: number; lcl: number; ucl: number; df: number; n: number; cases: number; exp_cases: number; n_pir_missing: number }
