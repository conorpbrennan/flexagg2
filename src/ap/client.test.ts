import { afterEach, describe, expect, it, vi } from "vitest";
import { AP_BASE, ApError, apDiscovery, apMdx } from "./client";

const ROOT = "/ap/activeviam/pivot/rest/v9";

function mockFetch(res: Response) {
  const f = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", f);
  return f;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("ap client", () => {
  it("uses /ap as base", () => {
    expect(AP_BASE).toBe("/ap");
  });

  it("apMdx posts mdx with the default 30 s time limit", async () => {
    const f = mockFetch(json({ axes: [], cells: [] }));
    await apMdx("SELECT FROM [Exposures]");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${ROOT}/cube/query/mdx`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      mdx: "SELECT FROM [Exposures]",
      context: { queriesTimeLimit: "30" },
    });
  });

  it("apMdx honours timeLimitS and passes the abort signal", async () => {
    const f = mockFetch(json({ axes: [], cells: [] }));
    const ac = new AbortController();
    await apMdx("x", { timeLimitS: 5, signal: ac.signal });
    const [, init] = f.mock.calls[0];
    expect(JSON.parse(init.body).context.queriesTimeLimit).toBe("5");
    expect(init.signal).toBe(ac.signal);
  });

  it("unwraps data when present, else returns the body", async () => {
    mockFetch(json({ data: { axes: [], cells: [] } }));
    expect(await apMdx("x")).toEqual({ axes: [], cells: [] });
    mockFetch(json({ axes: [], cells: [] }));
    expect(await apMdx("x")).toEqual({ axes: [], cells: [] });
    const f = mockFetch(json({ data: { catalogs: [] } }));
    expect(await apDiscovery()).toEqual({ catalogs: [] });
    expect(f.mock.calls[0][0]).toBe(`${ROOT}/cube/discovery`);
  });

  it("turns an errorChain body into ApError with trimmed message", async () => {
    mockFetch(
      json(
        {
          errorChain: [
            { type: "X", message: "[400] com.activeviam.mdx.MdxException: Unknown hierarchy [Foo]" },
            { type: "Y", message: "second" },
          ],
          stackTrace: "...",
        },
        400,
      ),
    );
    const err = await apMdx("x").catch((e) => e);
    expect(err).toBeInstanceOf(ApError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("Unknown hierarchy [Foo]");
    expect(err.chain).toEqual(["Unknown hierarchy [Foo]", "second"]);
  });

  it("never trims a message to empty", async () => {
    mockFetch(json({ errorChain: [{ type: "X", message: "[400] a.b.C: " }] }, 400));
    const err = await apMdx("x").catch((e) => e);
    expect(err.message.length).toBeGreaterThan(0);
  });

  it("a non-JSON 500 becomes HTTP 500", async () => {
    mockFetch(new Response("<html>boom</html>", { status: 500 }));
    const err = await apDiscovery().catch((e) => e);
    expect(err).toBeInstanceOf(ApError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("HTTP 500");
  });

  it("ApError defaults chain to [message]", () => {
    expect(new ApError(400, "m").chain).toEqual(["m"]);
  });

  it("an aborted request rejects the returned promise (no stray rejection)", async () => {
    const abort = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    await expect(apMdx("x")).rejects.toBe(abort);
  });
});
