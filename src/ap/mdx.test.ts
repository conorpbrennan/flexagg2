import { describe, expect, it } from "vitest";
import { buildMdx, memberKey, measureKey, pathKey, splitPath, type ApQuery } from "./mdx";

const MGR = "[Positions].[Manager].[Manager]";
const COUNTRY = "[Securities].[Security].[Country]";
const SECTOR = "[Securities].[Security].[Sector]";
const DATE = "[Exposures].[Date].[Date]";
const UNITS = "[Units].[Units].[Units]";
const SEP = "␞";

const base: ApQuery = {
  cube: "Exposures",
  rows: [],
  cols: [],
  measures: ["Net exposure", "Scenario VaR 99"],
  filters: {},
  nonEmpty: false,
  slicing: [UNITS],
  depth: { [MGR]: 1, [COUNTRY]: 1, [SECTOR]: 2, [DATE]: 1, [UNITS]: 1, "[D]]].[H].[L]": 1 },
};
const q = (o: Partial<ApQuery>): ApQuery => ({ ...base, ...o });
const M2 = "{[Measures].[Net exposure], [Measures].[Scenario VaR 99]}";

describe("path helpers", () => {
  it("joins and splits on the record separator", () => {
    expect(pathKey(["UK", "Energy"])).toBe(`UK${SEP}Energy`);
    expect(splitPath(`UK${SEP}Energy`)).toEqual(["UK", "Energy"]);
    expect(splitPath("Base")).toEqual(["Base"]);
  });
  it("measureKey doubles ]", () => {
    expect(measureKey("a]b")).toBe("[Measures].[a]]b]");
  });
});

describe("memberKey", () => {
  it("writes the full path below AllMember", () => {
    expect(memberKey(SECTOR, pathKey(["UK", "Energy"]), [])).toBe(
      "[Securities].[Security].[ALL].[AllMember].[UK].[Energy]",
    );
  });
  it("writes the short form for a slicing level", () => {
    expect(memberKey(UNITS, "$", [UNITS])).toBe("[Units].[Units].[Units].[$]");
  });
});

describe("memberKey normalisation", () => {
  it("(s) the level key is normalised before the slicing check and the write", () => {
    const k = "[D]]].[H].[L]]x]";
    expect(memberKey(k, "m", [k])).toBe("[D]]].[H].[L]]x].[m]");
    expect(memberKey(k, "m", [])).toBe("[D]]].[H].[ALL].[AllMember].[m]");
  });
  it("(s3) the level name never sits before [ALL]: the level form is a 400 live", () => {
    const mk = memberKey(COUNTRY, "UK", []);
    expect(mk).toBe("[Securities].[Security].[ALL].[AllMember].[UK]");
    expect(mk).not.toContain("[Country]");
  });
  it("(s2) a malformed level key throws from memberKey itself", () => {
    expect(() => memberKey("[a].[b]", "m", [])).toThrow(/^bad level key: \[a\]\.\[b\]$/);
  });
});

describe("buildMdx", () => {
  it("(a) one row level + two measures", () => {
    expect(buildMdx(q({ rows: [MGR] }))).toBe(
      `SELECT ${M2} ON COLUMNS, [Positions].[Manager].[Manager].Members ON ROWS FROM [Exposures]`,
    );
  });
  it("NON EMPTY goes on both axes", () => {
    expect(buildMdx(q({ rows: [MGR], nonEmpty: true }))).toBe(
      `SELECT NON EMPTY ${M2} ON COLUMNS, NON EMPTY [Positions].[Manager].[Manager].Members ON ROWS FROM [Exposures]`,
    );
  });
  it("(b) two row levels crossjoin", () => {
    expect(buildMdx(q({ rows: [MGR, DATE] }))).toBe(
      `SELECT ${M2} ON COLUMNS, CrossJoin([Positions].[Manager].[Manager].Members, [Exposures].[Date].[Date].Members) ON ROWS FROM [Exposures]`,
    );
  });
  it("(c) one col level", () => {
    expect(buildMdx(q({ cols: [DATE] }))).toBe(
      `SELECT CrossJoin(${M2}, [Exposures].[Date].[Date].Members) ON COLUMNS FROM [Exposures]`,
    );
  });
  it("(d) single-member filter off-axis goes to WHERE", () => {
    expect(buildMdx(q({ rows: [MGR], filters: { [COUNTRY]: [pathKey(["UK"])] } }))).toBe(
      `SELECT ${M2} ON COLUMNS, [Positions].[Manager].[Manager].Members ON ROWS FROM [Exposures] WHERE ([Securities].[Security].[ALL].[AllMember].[UK])`,
    );
  });
  it("(e) two-member filter becomes a sub-select", () => {
    expect(buildMdx(q({ rows: [MGR], filters: { [COUNTRY]: ["UK", "FR"] } }))).toBe(
      `SELECT ${M2} ON COLUMNS, [Positions].[Manager].[Manager].Members ON ROWS FROM (SELECT {[Securities].[Security].[ALL].[AllMember].[UK], [Securities].[Security].[ALL].[AllMember].[FR]} ON COLUMNS FROM [Exposures])`,
    );
  });
  it("two filtered hierarchies nest once each", () => {
    expect(
      buildMdx(q({ rows: [MGR], filters: { [COUNTRY]: ["UK", "FR"], [DATE]: ["d1", "d2"] } })),
    ).toBe(
      `SELECT ${M2} ON COLUMNS, [Positions].[Manager].[Manager].Members ON ROWS FROM (SELECT {[Exposures].[Date].[ALL].[AllMember].[d1], [Exposures].[Date].[ALL].[AllMember].[d2]} ON COLUMNS FROM (SELECT {[Securities].[Security].[ALL].[AllMember].[UK], [Securities].[Security].[ALL].[AllMember].[FR]} ON COLUMNS FROM [Exposures]))`,
    );
  });
  it("(f) a member named a]b is escaped", () => {
    expect(buildMdx(q({ filters: { [COUNTRY]: ["a]b"] } }))).toBe(
      `SELECT ${M2} ON COLUMNS FROM [Exposures] WHERE ([Securities].[Security].[ALL].[AllMember].[a]]b])`,
    );
  });
  it("escapes measure, cube and level names", () => {
    expect(
      buildMdx(q({ cube: "C]x", measures: ["m]1"], rows: ["[D]]].[H].[L]"] })),
    ).toBe("SELECT {[Measures].[m]]1]} ON COLUMNS, [D]]].[H].[L].Members ON ROWS FROM [C]]x]");
  });
  it("(g) no rows means no ROWS axis", () => {
    expect(buildMdx(q({}))).toBe(`SELECT ${M2} ON COLUMNS FROM [Exposures]`);
  });
  it("(h) empty measures throws", () => {
    expect(() => buildMdx(q({ measures: [] }))).toThrow(/^select at least one measure$/);
  });
  it("(i) a Sector member carries its Country path", () => {
    expect(buildMdx(q({ filters: { [SECTOR]: [pathKey(["UK", "Energy"])] } }))).toBe(
      `SELECT ${M2} ON COLUMNS FROM [Exposures] WHERE ([Securities].[Security].[ALL].[AllMember].[UK].[Energy])`,
    );
  });
  it("(j) rows Country+Sector put only the Sector level on the axis", () => {
    expect(buildMdx(q({ rows: [COUNTRY, SECTOR] }))).toBe(
      `SELECT ${M2} ON COLUMNS, [Securities].[Security].[Sector].Members ON ROWS FROM [Exposures]`,
    );
  });
  it("(j2) drill: Country filter with Sector on rows is a sub-select", () => {
    expect(buildMdx(q({ rows: [COUNTRY, SECTOR], filters: { [COUNTRY]: ["UK"] } }))).toBe(
      `SELECT ${M2} ON COLUMNS, [Securities].[Security].[Sector].Members ON ROWS FROM (SELECT {[Securities].[Security].[ALL].[AllMember].[UK]} ON COLUMNS FROM [Exposures])`,
    );
  });
  it("(k) a Date filter with Date on rows is a sub-select, not WHERE", () => {
    expect(buildMdx(q({ rows: [DATE], filters: { [DATE]: ["d1"] } }))).toBe(
      `SELECT ${M2} ON COLUMNS, [Exposures].[Date].[Date].Members ON ROWS FROM (SELECT {[Exposures].[Date].[ALL].[AllMember].[d1]} ON COLUMNS FROM [Exposures])`,
    );
  });
  it("(l) a Units $ filter is written in the short slicing form", () => {
    expect(buildMdx(q({ filters: { [UNITS]: ["$"] } }))).toBe(
      `SELECT ${M2} ON COLUMNS FROM [Exposures] WHERE ([Units].[Units].[Units].[$])`,
    );
  });
  it("two single-member WHERE filters form one tuple", () => {
    expect(buildMdx(q({ filters: { [UNITS]: ["Base"], [DATE]: ["d1"] } }))).toBe(
      `SELECT ${M2} ON COLUMNS FROM [Exposures] WHERE ([Units].[Units].[Units].[Base], [Exposures].[Date].[ALL].[AllMember].[d1])`,
    );
  });
  it("two filters on levels of one hierarchy are an explicit error", () => {
    expect(() => buildMdx(q({ filters: { [COUNTRY]: ["UK"], [SECTOR]: ["UK" + SEP + "Energy"] } }))).toThrow(
      /^two filters on one hierarchy: \[Securities\]\.\[Security\]$/,
    );
  });
  it("an empty filter is ignored", () => {
    expect(buildMdx(q({ filters: { [COUNTRY]: [] } }))).toBe(`SELECT ${M2} ON COLUMNS FROM [Exposures]`);
  });
  it("(m) reversed rows [Sector, Country] still put only Sector on the axis", () => {
    expect(buildMdx(q({ rows: [SECTOR, COUNTRY] }))).toBe(
      `SELECT ${M2} ON COLUMNS, [Securities].[Security].[Sector].Members ON ROWS FROM [Exposures]`,
    );
  });
  it("(m2) depth decides on cols too, and first-seen hierarchy order is kept", () => {
    expect(buildMdx(q({ rows: [DATE], cols: [SECTOR, MGR, COUNTRY] }))).toBe(
      `SELECT CrossJoin(CrossJoin(${M2}, [Securities].[Security].[Sector].Members), [Positions].[Manager].[Manager].Members) ON COLUMNS, [Exposures].[Date].[Date].Members ON ROWS FROM [Exposures]`,
    );
  });
  it("(n) a missing depth throws", () => {
    expect(() => buildMdx(q({ rows: [COUNTRY], depth: {} }))).toThrow(
      /^no depth for \[Securities\]\.\[Security\]\.\[Country\]$/,
    );
    expect(() => buildMdx(q({ cols: [DATE], depth: {} }))).toThrow(
      /^no depth for \[Exposures\]\.\[Date\]\.\[Date\]$/,
    );
  });
  it("(o) a multi-part slicing member throws", () => {
    expect(() => buildMdx(q({ filters: { [UNITS]: [pathKey(["a", "b"])] } }))).toThrow(
      /^slicing member must be one name: \[Units\]\.\[Units\]\.\[Units\]$/,
    );
  });
  it("(p) members holding [, ' and a newline come out exact", () => {
    expect(buildMdx(q({ filters: { [COUNTRY]: ["a[b'c\nd"] } }))).toBe(
      `SELECT ${M2} ON COLUMNS FROM [Exposures] WHERE ([Securities].[Security].[ALL].[AllMember].[a[b'c\nd])`,
    );
  });
  it("(q) one hierarchy on rows and cols throws", () => {
    expect(() => buildMdx(q({ rows: [COUNTRY], cols: [SECTOR] }))).toThrow(
      /^hierarchy on two axes: \[Securities\]\.\[Security\]$/,
    );
  });
  it("(r) an empty path part throws", () => {
    expect(() => buildMdx(q({ filters: { [COUNTRY]: [""] } }))).toThrow(/^empty member name$/);
    expect(() => buildMdx(q({ filters: { [SECTOR]: [pathKey(["UK", ""])] } }))).toThrow(/^empty member name$/);
  });
});
