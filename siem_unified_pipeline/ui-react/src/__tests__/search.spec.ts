import { describe, it, expect } from "vitest";
import { clampLimit, clampTimeRange, type SearchModel } from "../hooks/useSearchModel";

describe("search model guardrails", () => {
  it("clamps limit to <=1000", () => {
    expect(clampLimit(5000)).toBe(1000);
    expect(clampLimit(0)).toBe(1);
  });
  it("limits time to 24h when span too big", () => {
    const m: SearchModel = {
      tenant_ids: ["default"],
      time_range: { start: 0, end: 999999999 },
      limit: 200,
    };
    const out = clampTimeRange(m);
    expect(out.time_range.last_seconds).toBe(24 * 3600);
  });
});


