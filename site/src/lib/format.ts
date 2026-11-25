export const pct = (x: number, digits = 1) => `${(100 * x).toFixed(digits)}%`;
export const pctCI = (p: number, l: number, u: number) =>
  `${(100 * p).toFixed(1)}% (95% CI ${(100 * l).toFixed(1)}–${(100 * u).toFixed(1)})`;
export const int = (x: number) => x.toLocaleString("en-US");
