// The views client talks to the views store (its own base), never to risk_api's /api/views.
import { vi, describe, it, expect, beforeEach } from "vitest";
import { listViews, loadView, saveView, deleteView, makeFolder } from "./views";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true, status: 200, json: async () => ({}), text: async () => "{}",
  });
  vi.stubGlobal("fetch", fetchMock);
});

const urls = () => fetchMock.mock.calls.map((c) => c[0] as string);

describe("views client", () => {
  it("every call goes to /views-api/views", async () => {
    await listViews();
    await loadView("Public/Risk/slug");
    await saveView("n", "Public/Risk", { rows: [], cols: [], measures: [] });
    await deleteView("Public/Risk/slug");
    await makeFolder("Public", "Risk");
    expect(urls()).toEqual([
      "/views-api/views",
      "/views-api/views/item/Public/Risk/slug",
      "/views-api/views/save",
      "/views-api/views/item/Public/Risk/slug",
      "/views-api/views/folder",
    ]);
  });

  it("encodes each path segment but keeps the '/' separators", async () => {
    await loadView("Public/Q1 #2/a?b%c");
    await deleteView("Public/Q1 #2/a?b%c");
    const want = "/views-api/views/item/Public/Q1%20%232/a%3Fb%25c";
    expect(urls()).toEqual([want, want]);
  });

  it("no URL starts /api/views", async () => {
    await listViews();
    await loadView("Public/a");
    await saveView("n", "Public", { rows: [], cols: [], measures: [] });
    await deleteView("Public/a");
    await makeFolder("Public", "x");
    expect(urls().filter((u) => u.startsWith("/api/views"))).toEqual([]);
  });

  it("save sends name, folder and state as PUT json", async () => {
    await saveView("n", "Public/Risk", { rows: ["r"], cols: [], measures: ["m"] });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "n", folder: "Public/Risk", state: { rows: ["r"], cols: [], measures: ["m"] },
    });
  });

  it("the shared client still defaults to /api", async () => {
    const { apiGet } = await import("./client");
    await apiGet("/meta");
    expect(urls()).toEqual(["/api/meta"]);
  });
});
