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

  it("a doc without rows/measures leaves them undefined so the current ones stay", async () => {
    doc = { ...mk(2, { cols: [SECTOR] }), state: { cols: [SECTOR], render: "chart" } };
    const onLoad = await open();
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    const s = onLoad.mock.calls[0][0] as ViewState;
    expect(s.rows).toBeUndefined();
    expect(s.measures).toBeUndefined();
    expect(s.cols).toEqual([SECTOR]);
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

  it("refuses to save without a name and sends nothing", async () => {
    render(<Repository currentState={cur} onLoad={() => {}} />);
    await screen.findByText("v");
    fireEvent.change(screen.getByPlaceholderText("view name"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText("name the view")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => c[0] === "/views-api/views/save")).toBe(false);
  });

  it("the form description wins over the current state's description, trimmed", async () => {
    render(<Repository currentState={{ ...cur, description: "old" }} onLoad={() => {}} />);
    await screen.findByText("v");
    fireEvent.change(screen.getByPlaceholderText("view name"), { target: { value: " mine " } });
    fireEvent.change(screen.getByPlaceholderText(/description/), { target: { value: " new text " } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === "/views-api/views/save")).toBe(true));
    const call = fetchMock.mock.calls.find((c) => c[0] === "/views-api/views/save")!;
    const sent = JSON.parse((call[1] as RequestInit).body as string);
    expect(sent.name).toBe("mine");
    expect(sent.state.description).toBe("new text");
  });

  it("shows the server's message when a save fails", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/views/save")) {
        return { ok: false, status: 409, statusText: "", json: async () => ({ detail: "name taken" }) };
      }
      const body = url.endsWith("/views") && !init ? TREE : {};
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    });
    render(<Repository currentState={cur} onLoad={() => {}} />);
    await screen.findByText("v");
    fireEvent.change(screen.getByPlaceholderText("view name"), { target: { value: "mine" } });
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText("name taken")).toBeInTheDocument();
  });

  it("deleting a view sends DELETE for its file and re-lists", async () => {
    render(<Repository currentState={cur} onLoad={() => {}} />);
    await screen.findByText("v");
    fireEvent.click(screen.getByText("×"));
    await waitFor(() => {
      const del = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "DELETE");
      expect(del?.[0]).toBe("/views-api/views/item/Public/Risk/v");
    });
    await waitFor(() => {
      const lists = fetchMock.mock.calls.filter((c) => c[0] === "/views-api/views" && !c[1]);
      expect(lists.length).toBe(2);
    });
  });

  it("shows the error when deleting fails", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return { ok: false, status: 500, statusText: "", json: async () => ({ detail: "disk full" }) };
      }
      const body = url.endsWith("/views") ? TREE : {};
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    });
    render(<Repository currentState={cur} onLoad={() => {}} />);
    await screen.findByText("v");
    fireEvent.click(screen.getByText("×"));
    expect(await screen.findByText("disk full")).toBeInTheDocument();
  });

  it("shows the error when the list cannot be loaded", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false, status: 500, statusText: "", json: async () => ({ detail: "store down" }),
    }));
    render(<Repository currentState={cur} onLoad={() => {}} />);
    expect(await screen.findByText("store down")).toBeInTheDocument();
  });

  it("an empty store shows 'empty' and offers Public and Private folders", async () => {
    fetchMock.mockImplementation(async () => {
      const body = { sections: { Public: { folders: {}, views: [] } } };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    });
    render(<Repository currentState={cur} onLoad={() => {}} />);
    expect(await screen.findByText("empty")).toBeInTheDocument();
    expect([...screen.getByRole("combobox").querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Public"]);
  });

  it("lists every nested folder as a save target", async () => {
    render(<Repository currentState={cur} onLoad={() => {}} />);
    await screen.findByText("v");
    const opts = [...screen.getByRole("combobox").querySelectorAll("option")].map((o) => o.textContent);
    expect(opts).toEqual(["Public", "Public/Risk", "Private"]);
  });
});
