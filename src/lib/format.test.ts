import { describe, it, expect } from "vitest";
import { pct, signedPct, signedNum, money, num, compact, ragClass, ragLabel, days } from "./format";

describe("format", () => {
  it("pct scales fractions to %", () => {
    expect(pct(0.035)).toBe("3.50%");
    expect(pct(0.035, 1)).toBe("3.5%");
    expect(pct(null)).toBe("—");
  });
  it("signedPct prefixes +", () => {
    expect(signedPct(0.01)).toBe("+1.00%");
    expect(signedPct(-0.01)).toBe("-1.00%");
  });
  it("num and days", () => {
    expect(num(1.2345, 3)).toBe("1.234");
    expect(days(2.2)).toBe("2.2d");
  });
  it("maps the three RAG vocabularies to one class", () => {
    expect(ragClass("green")).toBe("rag-green");
    expect(ragClass("pass")).toBe("rag-green");
    expect(ragClass("amber")).toBe("rag-amber");
    expect(ragClass("warn")).toBe("rag-amber");
    expect(ragClass("breach")).toBe("rag-red");
    expect(ragClass("fail")).toBe("rag-red");
    expect(ragLabel("breach")).toBe("breach");
  });

  it("every formatter renders null, undefined and NaN as an em dash", () => {
    for (const f of [pct, signedPct, signedNum, money, num, compact, days]) {
      expect(f(null)).toBe("—");
      expect(f(undefined)).toBe("—");
      expect(f(Number.NaN)).toBe("—");
    }
  });
  it("signedPct shows no sign for zero", () => {
    expect(signedPct(0)).toBe("0.00%");
  });
  it("signedNum prefixes + only for positives", () => {
    expect(signedNum(1.234)).toBe("+1.23");
    expect(signedNum(-1.234)).toBe("-1.23");
    expect(signedNum(0)).toBe("0.00");
    expect(signedNum(2, 0)).toBe("+2");
  });
  it("money is whole dollars with separators and a leading minus", () => {
    expect(money(1234567.6)).toBe("$1,234,568");
    expect(money(-1234.4)).toBe("-$1,234");
    expect(money(0)).toBe("$0");
  });
  it("compact picks K/M/B at the thresholds and keeps the sign", () => {
    expect(compact(999)).toBe("999");
    expect(compact(1000)).toBe("1.0K");
    expect(compact(1_500_000)).toBe("1.5M");
    expect(compact(2_250_000_000)).toBe("2.3B");
    expect(compact(-2_500)).toBe("-2.5K");
  });
  it("ragClass is case-insensitive and falls back to muted", () => {
    expect(ragClass("GREEN")).toBe("rag-green");
    expect(ragClass("ok")).toBe("rag-green");
    expect(ragClass("red")).toBe("rag-red");
    expect(ragClass("whatever")).toBe("muted");
    expect(ragClass(null)).toBe("muted");
  });
  it("ragLabel normalises vocabularies", () => {
    expect(ragLabel("GREEN")).toBe("pass");
    expect(ragLabel("ok")).toBe("pass");
    expect(ragLabel("amber")).toBe("warn");
    expect(ragLabel("red")).toBe("fail");
    expect(ragLabel("fail")).toBe("fail");
    expect(ragLabel("Unknown")).toBe("unknown");
    expect(ragLabel(null)).toBe("—");
  });
});
