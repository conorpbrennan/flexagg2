// The Repository panel reads/writes the views store. A v1 doc is refused (one line, nothing loads); a v2
// doc hands rows/cols/measures/filters to the pivot, minus level keys the cube model does not have.
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import fixture from "../ap/__fixtures__/discovery.json";
import type { RawDiscovery } from "../ap/client";
import { toCubeModel } from "../ap/discovery";

const model = toCubeModel(fixture as unknown as RawDiscovery);
vi.mock("../ap/discovery", async (orig) => ({
  ...(await orig<typeof import("../ap/discovery")>()),
  useCubeModel: () => ({ data: model }),
}));

import { Repository } from "./Repository";
import type { ViewState } from "../api/types";

const COUNTRY = "[Securities].[Security].[Country]";
const SECTOR = "[Securities].[Security].[Sector]";
const MEASURE = model.measures.find((m) => m.visible)!.name;

const TREE = {
  sections: {
    Public: { folders: { Risk: { folders: {}, views: [
      { name: "v", slug: "v", path: "Public/Risk", file: "Public/Risk/v" }] } }, views: [] },
    Private: { folders: {}, views: [] },
  },
};

let doc: unknown;
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const body = url.endsWith("/views") && !init ? TREE : url.includes("/views/item/") ? doc : { file: "Public/Risk/v" };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

const cur: ViewState = { rows: [COUNTRY], cols: [], measures: [MEASURE] };
const mk = (v: number, state: Partial<ViewState>) => ({
  schema_version: v, name: "v", path: "Public/Risk", created: "", updated: "",
  state: { rows: [], cols: [], measures: [], ...state },
});

async function open() {
  const onLoad = vi.fn();
  render(<Repository currentState={cur} onLoad={onLoad} />);
  fireEvent.click(await screen.findByText("v"));
  return onLoad;
}

describe("Repository", () => {
  it("lists from /views-api and never calls /api/views", async () => {
    doc = mk(2, {});
    await open();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls).toEqual(["/views-api/views", "/views-api/views/item/Public/Risk/v"]);
  });

  it("refuses a v1 doc with one line and loads nothing", async () => {
    doc = mk(1, { rows: ["Sector"], measures: [MEASURE] });
    const onLoad = await open();
    expect(await screen.findByText("saved before ActivePivot fields; not loadable")).toBeInTheDocument();
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("a doc with no schema_version is refused too", async () => {
    doc = { ...mk(2, {}), schema_version: undefined };
    const onLoad = await open();
    expect(await screen.findByText(/not loadable/)).toBeInTheDocument();
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("a v2 doc applies rows, cols, measures and filters", async () => {
    const filters = { [COUNTRY]: ["US"] };
    doc = mk(2, { rows: [COUNTRY], cols: [SECTOR], measures: [MEASURE], filters });
    const onLoad = await open();
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    const [s, name] = onLoad.mock.calls[0];
    expect(s).toMatchObject({ rows: [COUNTRY], cols: [SECTOR], measures: [MEASURE], filters });
    expect(name).toBe("v");
    expect(screen.queryByText(/not loadable/)).toBeNull();
  });

  it("drops keys the cube model lacks and names them in one line", async () => {
    doc = mk(2, {
      rows: [COUNTRY, "[Nope].[Nope].[Nope]"], cols: [], measures: [MEASURE, "No such measure"],
      filters: { [COUNTRY]: ["US"], "[Gone].[Gone].[Gone]": ["x"] },
    });
    const onLoad = await open();
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    const s = onLoad.mock.calls[0][0] as ViewState;
    expect(s.rows).toEqual([COUNTRY]);
    expect(s.measures).toEqual([MEASURE]);
    expect(s.filters).toEqual({ [COUNTRY]: ["US"] });
    const line = screen.getByText(/not in the cube/);
    expect(line.textContent).toContain("[Nope].[Nope].[Nope]");
    expect(line.textContent).toContain("No such measure");
    expect(line.textContent).toContain("[Gone].[Gone].[Gone]");
  });

  it("saves to /views-api/views/save with the current state", async () => {
    render(<Repository currentState={cur} onLoad={() => {}} />);
    await screen.findByText("v");
    fireEvent.change(screen.getByPlaceholderText("view name"), { target: { value: "mine" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === "/views-api/views/save")).toBe(true));
    const call = fetchMock.mock.calls.find((c) => c[0] === "/views-api/views/save")!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({
      name: "mine", folder: "Public", state: { rows: [COUNTRY], measures: [MEASURE] },
    });
  });
});
