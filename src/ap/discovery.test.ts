import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/discovery.json";
import type { RawDiscovery } from "./client";
import { levelKey, parseLevelKey, toCubeModel } from "./discovery";

const raw = fixture as unknown as RawDiscovery;
const model = toCubeModel(raw);

describe("toCubeModel", () => {
  it("yields Securities levels in order, depth 1..4", () => {
    const sec = model.levels.filter((l) => l.dim === "Securities");
    expect(sec.map((l) => l.level)).toEqual(["Country", "Sector", "Issuer", "Position"]);
    expect(sec.map((l) => l.depth)).toEqual([1, 2, 3, 4]);
    expect(sec[0].key).toBe("[Securities].[Security].[Country]");
    expect(sec[0].hier).toBe("Security");
  });

  it("has no ALL level and no Epoch dimension", () => {
    expect(model.levels.some((l) => l.level === "ALL")).toBe(false);
    expect(model.levels.some((l) => l.dim === "Epoch")).toBe(false);
    expect(model.slicing.some((k) => k.includes("[Epoch]"))).toBe(false);
  });

  it("marks slicing hierarchies, depth 1", () => {
    const units = model.levels.find((l) => l.dim === "Units")!;
    expect(units.slicing).toBe(true);
    expect(units.depth).toBe(1);
    expect(model.slicing).toContain("[Units].[Units].[Units]");
    expect(model.slicing).toHaveLength(4);
    expect(model.levels.find((l) => l.level === "Country")!.slicing).toBe(false);
  });

  it("keeps hidden measures and defaults a missing formatString", () => {
    expect(model.measures).toHaveLength(15);
    expect(model.measures.filter((m) => !m.visible).length).toBeGreaterThanOrEqual(2);
    const ts = model.measures.find((m) => m.name === "update.TIMESTAMP")!;
    expect(ts.visible).toBe(false);
    expect(ts.formatString).toBe("");
    const nx = model.measures.find((m) => m.name === "Net exposure")!;
    expect(nx).toEqual({ name: "Net exposure", caption: "Net exposure", formatString: "0.000", visible: true });
  });

  it("reports the cube name and throws for an unknown cube", () => {
    expect(model.cube).toBe("Exposures");
    expect(() => toCubeModel(raw, "Nope")).toThrow("cube Nope not in discovery");
  });
});

describe("levelKey / parseLevelKey", () => {
  it("builds the bracket form", () => {
    expect(levelKey({ dim: "A", hier: "B", level: "C" })).toBe("[A].[B].[C]");
  });

  it("round-trips names holding ] and [ and .", () => {
    const refs = [
      { dim: "a]b", hier: "]]", level: "c].[d" },
      { dim: "[x", hier: "y.z", level: "]" },
      { dim: "", hier: "h", level: "l" },
    ];
    for (const r of refs) expect(parseLevelKey(levelKey(r))).toEqual(r);
    expect(levelKey(refs[0])).toBe("[a]]b].[]]]]].[c]].[d]");
  });

  it("rejects malformed keys", () => {
    expect(() => parseLevelKey("[a].[b]")).toThrow();
    expect(() => parseLevelKey("a.b.c")).toThrow();
    expect(() => parseLevelKey("[a].[b].[c]x")).toThrow();
  });
});
