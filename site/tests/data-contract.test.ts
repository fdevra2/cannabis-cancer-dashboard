import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "public", "data");

describe("pipeline outputs (public/data)", () => {
  for (const f of readdirSync(dir).filter((f: string) => f.endsWith(".json"))) {
    it(`${f} has meta + data and valid proportions`, () => {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(j).toHaveProperty("meta");
      expect(Array.isArray(j.data)).toBe(true);
      for (const r of j.data) {
        if ("p" in r && "lcl" in r && r.p !== null) {
          expect(r.lcl).toBeLessThanOrEqual(r.p);
          expect(r.ucl).toBeGreaterThanOrEqual(r.p);
          expect(["ok", "review", "suppress"]).toContain(r.status);
          expect(r.n).toBeGreaterThan(0);
        }
      }
    });
  }
});
