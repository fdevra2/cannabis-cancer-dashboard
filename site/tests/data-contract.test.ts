import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "public", "data");

function checkRows(rows: any[]) {
  for (const r of rows) {
    if (r && typeof r === "object" && "p" in r && "lcl" in r && r.p !== null) {
      expect(r.lcl).toBeLessThanOrEqual(r.p);
      expect(r.ucl).toBeGreaterThanOrEqual(r.p);
      expect(["ok", "review", "suppress"]).toContain(r.status);
      expect(r.n).toBeGreaterThan(0);
    }
    if (r && typeof r === "object" && "or" in r && "lcl" in r) {
      expect(r.lcl).toBeLessThanOrEqual(r.or + 1e-9);
      expect(r.ucl).toBeGreaterThanOrEqual(r.or - 1e-9);
    }
  }
}

describe("pipeline outputs (public/data)", () => {
  for (const f of readdirSync(dir).filter((f: string) => f.endsWith(".json"))) {
    it(`${f} has meta + data and valid estimates`, () => {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(j).toHaveProperty("meta");
      expect(j.data && typeof j.data === "object").toBe(true);
      if (Array.isArray(j.data)) checkRows(j.data);
      else for (const v of Object.values(j.data)) if (Array.isArray(v)) checkRows(v);
    });
  }
});

describe("evidence.json contains only verified rows with DOIs", () => {
  it("every row VERIFIED and has a DOI", () => {
    const j = JSON.parse(readFileSync(join(dir, "evidence.json"), "utf8"));
    for (const r of j.data) { expect(r.status).toBe("VERIFIED"); expect(r.doi).toMatch(/^10\./); }
  });
});

describe("E-value", async () => {
  const { evalue, evalueRR } = await import("../src/lib/evalue");
  it("matches the closed form RR + sqrt(RR(RR-1))", () => {
    expect(evalueRR(2)).toBeCloseTo(2 + Math.sqrt(2), 10);
    expect(evalueRR(1)).toBe(1);
    expect(evalueRR(0.5)).toBeCloseTo(evalueRR(2), 10);
  });
  it("uses the CI limit closest to the null, and 1 when the CI includes 1", () => {
    expect(evalue(1.5, 1.2, 1.9, "RR").ci).toBeCloseTo(evalueRR(1.2), 10);
    expect(evalue(0.6, 0.4, 0.8, "RR").ci).toBeCloseTo(evalueRR(0.8), 10);
    expect(evalue(1.19, 0.96, 1.47, "OR").ci).toBe(1);
    expect(evalue(4, 2, 8, "OR", true).point).toBeCloseTo(evalueRR(2), 10); // sqrt(OR) for common outcomes
  });
});
