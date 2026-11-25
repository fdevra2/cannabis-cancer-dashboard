// Minimal shared state (e.g. the confounding-toggle selection feeds the E-value calculator).
type Listener<T> = (v: T) => void;
export function writable<T>(initial: T) {
  let value = initial;
  const ls = new Set<Listener<T>>();
  return {
    get: () => value,
    set(v: T) { value = v; ls.forEach((l) => l(v)); },
    subscribe(l: Listener<T>) { ls.add(l); return () => ls.delete(l); },
  };
}

export interface PickedEstimate { label: string; est: number; lcl: number; ucl: number; measure: "OR" | "RR" | "HR"; source: string }
export const pickedEstimate = writable<PickedEstimate | null>(null);
