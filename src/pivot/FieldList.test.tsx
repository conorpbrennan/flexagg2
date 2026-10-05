// The field list reads the ActivePivot cube model: levels grouped dimension -> hierarchy in depth order,
// visible measures only (with a text filter), and a filter picker whose members come from fetchMembers.
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import fixture from "../ap/__fixtures__/discovery.json";
import type { RawDiscovery } from "../ap/client";
import { toCubeModel } from "../ap/discovery";

const model = toCubeModel(fixture as unknown as RawDiscovery);

vi.mock("../ap/discovery", async (orig) => ({
  ...(await orig<typeof import("../ap/discovery")>()),
  useCubeModel: () => ({ data: model }),
}));
vi.mock("../ap/pivotSource", async (orig) => ({ ...(await orig<typeof import("../ap/pivotSource")>()), fetchMembers: vi.fn() }));

import { FieldList } from "./FieldList";
import { fetchMembers } from "../ap/pivotSource";
import type { PivotConfig } from "./usePivot";

const COUNTRY = "[Securities].[Security].[Country]";
const SEP = "␞";

const cfg0: PivotConfig = {
  rows: [], cols: [], measures: [], filters: {}, totals: true, rowTot: false, hideEmpty: true, heat: true,
  asPct: false, prec: 3, sort: [], units: "dollar",
};

function setup(cfg: PivotConfig = cfg0) {
  const setCfg = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FieldList cfg={cfg} setCfg={setCfg} onApply={() => {}} />
    </QueryClientProvider>,
  );
  return setCfg;
}

beforeEach(() => {
  vi.mocked(fetchMembers).mockReset();
});

describe("FieldList", () => {
  it("lists the Securities levels in depth order, by caption", () => {
    setup();
    const names = ["Country", "Sector", "Issuer", "Position"].map((n) => screen.getByTestId(`level-${n}`));
    for (let i = 1; i < names.length; i++) {
      expect(names[i - 1].compareDocumentPosition(names[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.queryByText("[Securities].[Security].[Country]")).toBeNull();
  });

  it("R puts the level KEY in rows", () => {
    const setCfg = setup();
    fireEvent.click(within(screen.getByTestId("level-Country")).getByTitle("to rows"));
    const upd = setCfg.mock.calls[0][0] as (c: PivotConfig) => PivotConfig;
    expect(upd(cfg0).rows).toEqual([COUNTRY]);
  });

  it("hidden measures are absent, visible ones are alphabetical", () => {
    setup();
    expect(screen.queryByText(/SingleValue|SINGLE_VALUE|update\.TIMESTAMP/i)).toBeNull();
    const list = screen.getByTestId("measures");
    const names = within(list).getAllByTestId("measure").map((e) => e.textContent?.replace(/[+−]$/, ""));
    expect(names).toHaveLength(12);
    expect(names).toEqual([...names].sort((a, b) => (a ?? "").localeCompare(b ?? "")));
  });

  it("the text filter narrows the measure list", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("filter measures"), { target: { value: "var 99" } });
    const names = within(screen.getByTestId("measures")).getAllByTestId("measure").map((e) => e.textContent);
    expect(names).toHaveLength(2);
    expect(names.join()).toMatch(/Scenario VaR 99/);
  });

  it("the filter picker lists what fetchMembers returns and stores paths, not captions", async () => {
    vi.mocked(fetchMembers).mockResolvedValue([
      { path: `Energy${SEP}UK`, label: "UK" },
      { path: "US", label: "United States" },
    ]);
    const setCfg = setup();
    fireEvent.click(within(screen.getByTestId("level-Country")).getByTitle("filter"));
    expect(await screen.findByText("United States")).toBeInTheDocument();
    expect(fetchMembers).toHaveBeenCalledWith(model, COUNTRY);
    fireEvent.click(screen.getByLabelText("United States"));
    fireEvent.click(screen.getByText("done"));
    const upd = setCfg.mock.calls[0][0] as (c: PivotConfig) => PivotConfig;
    expect(upd(cfg0).filters).toEqual({ [COUNTRY]: ["US"] });
  });

  it("a filter chip shows captions, never bracketed keys or path separators", () => {
    setup({ ...cfg0, rows: [COUNTRY], filters: { [COUNTRY]: [`A${SEP}Energy`] } });
    expect(screen.getByText(/Country=Energy/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("[Securities]");
    expect(document.body.textContent).not.toContain(SEP);
  });

  it("switching the picker to another level drops the unsaved ticks of the first", async () => {
    const SECTOR = model.levels.find((l) => l.level === "Sector")!.key;
    vi.mocked(fetchMembers).mockImplementation(async (_m, key) =>
      key === COUNTRY ? [{ path: "US", label: "United States" }] : [{ path: "Energy", label: "Energy" }]);
    const setCfg = setup();
    fireEvent.click(within(screen.getByTestId("level-Country")).getByTitle("filter"));
    fireEvent.click(await screen.findByLabelText("United States"));
    fireEvent.click(within(screen.getByTestId("level-Sector")).getByTitle("filter"));
    expect(await screen.findByLabelText("Energy")).not.toBeChecked();
    fireEvent.click(screen.getByText("done"));
    const upd = setCfg.mock.calls[0][0] as (c: PivotConfig) => PivotConfig;
    expect(upd(cfg0).filters[SECTOR]).toBeUndefined();
    expect(upd(cfg0).filters).toEqual({});
  });

  it("a saved view with an empty member list for a filter does not crash the field list", () => {
    const setCfg = setup({ ...cfg0, filters: { [COUNTRY]: [] } });
    expect(screen.getByText("Fields")).toBeInTheDocument();
    // caption-only chip: "Country", not "Country="
    const chip = screen.getByText("Country", { selector: ".tag" });
    expect(chip.textContent).toBe("Country×");
    fireEvent.click(within(chip).getByTitle("remove"));
    const upd = setCfg.mock.calls[0][0] as (c: PivotConfig) => PivotConfig;
    expect(upd({ ...cfg0, filters: { [COUNTRY]: [] } }).filters).toEqual({});
  });

  it("the picker search narrows members by caption, ignoring case, and ticks survive a new search", async () => {
    vi.mocked(fetchMembers).mockResolvedValue([
      { path: "UK", label: "United Kingdom" },
      { path: "US", label: "United States" },
      { path: "DE", label: "Germany" },
    ]);
    const setCfg = setup();
    fireEvent.click(within(screen.getByTestId("level-Country")).getByTitle("filter"));
    await screen.findByLabelText("Germany");
    const search = screen.getByPlaceholderText("search members");
    fireEvent.change(search, { target: { value: "  STATES " } });
    expect(screen.getAllByRole("checkbox").map((c) => c.parentElement!.textContent!.trim())).toEqual(["United States"]);
    fireEvent.click(screen.getByLabelText("United States"));
    fireEvent.change(search, { target: { value: "ger" } });
    expect(screen.queryByLabelText("United States")).toBeNull();
    fireEvent.click(screen.getByLabelText("Germany"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "zz" } });
    expect(screen.getByText("no member matches")).toBeInTheDocument();
    fireEvent.click(screen.getByText("done"));
    const upd = setCfg.mock.calls[0][0] as (c: PivotConfig) => PivotConfig;
    expect(upd(cfg0).filters).toEqual({ [COUNTRY]: ["US", "DE"] });
  });

  it("a long member list renders only the first 200 matches and says how many matched", async () => {
    vi.mocked(fetchMembers).mockResolvedValue(
      Array.from({ length: 5000 }, (_, i) => ({ path: `P${i}`, label: `Position ${i}` })));
    setup();
    fireEvent.click(within(screen.getByTestId("level-Country")).getByTitle("filter"));
    await screen.findByLabelText("Position 0");
    expect(screen.getAllByRole("checkbox")).toHaveLength(200);
    expect(screen.getByText("200 of 5,000 shown; refine the search")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("search members"), { target: { value: "position 4999" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByLabelText("Position 4999")).toBeInTheDocument();
    expect(screen.queryByText(/refine the search/)).toBeNull();
  });

  it("a members failure is shown in the picker", async () => {
    vi.mocked(fetchMembers).mockRejectedValue(new Error("retrieval limit"));
    setup();
    fireEvent.click(within(screen.getByTestId("level-Country")).getByTitle("filter"));
    await waitFor(() => expect(screen.getByText(/retrieval limit/)).toBeInTheDocument());
  });
});
