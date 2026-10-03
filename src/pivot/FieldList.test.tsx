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

  it("a members failure is shown in the picker", async () => {
    vi.mocked(fetchMembers).mockRejectedValue(new Error("retrieval limit"));
    setup();
    fireEvent.click(within(screen.getByTestId("level-Country")).getByTitle("filter"));
    await waitFor(() => expect(screen.getByText(/retrieval limit/)).toBeInTheDocument());
  });
});
