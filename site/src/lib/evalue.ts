// E-value (VanderWeele & Ding, Ann Intern Med 2017; doi:10.7326/M16-2607): the minimum strength of
// association, on the risk-ratio scale, that an unmeasured confounder would need with both exposure and
// outcome to fully explain away an observed association.
//   E = RR + sqrt(RR * (RR - 1))  for RR >= 1;  for RR < 1 apply to 1/RR.
// For odds ratios: with a rare outcome (<~15%) OR ≈ RR; otherwise RR ≈ sqrt(OR) (VanderWeele 2017 approximation).

export function evalueRR(rr: number): number {
  if (!(rr > 0) || !isFinite(rr)) return NaN;
  const r = rr < 1 ? 1 / rr : rr;
  return r + Math.sqrt(r * (r - 1));
}

export type Measure = "RR" | "HR" | "OR";

/** Convert an estimate to the approximate RR scale. */
export function toRR(est: number, measure: Measure, commonOutcome: boolean): number {
  if (measure === "OR" && commonOutcome) return Math.sqrt(est);
  return est; // RR; HR or OR with rare outcome treated as RR
}

export interface EValueResult { point: number; ci: number; ciIncludesNull: boolean; rrPoint: number; rrLimit: number | null }

/** E-value for the point estimate and for the CI limit closest to the null (1 if the CI includes 1). */
export function evalue(est: number, lcl: number | null, ucl: number | null, measure: Measure, commonOutcome = false): EValueResult {
  const rr = toRR(est, measure, commonOutcome);
  const lo = lcl == null ? null : toRR(lcl, measure, commonOutcome);
  const hi = ucl == null ? null : toRR(ucl, measure, commonOutcome);
  let limit: number | null = null;
  let includes = false;
  if (lo != null && hi != null) {
    includes = lo <= 1 && hi >= 1;
    limit = rr >= 1 ? lo : hi;
  }
  return {
    point: evalueRR(rr),
    ci: includes ? 1 : limit == null ? NaN : evalueRR(limit),
    ciIncludesNull: includes,
    rrPoint: rr,
    rrLimit: limit,
  };
}
