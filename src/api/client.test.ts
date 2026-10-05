import { describe, it, expect, vi, afterEach } from "vitest";
import { apiGet, apiSend, ApiError, API_BASE } from "./client";

const respond = (status: number, body: string, statusText = "") => () =>
  new Response(body, { status, statusText });
const fetchMock = vi.fn();
const fail = (p: Promise<unknown>) => p.then(() => { throw new Error("expected a rejection"); }, (e: ApiError) => e);
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});
function mock(make: () => Response) {
  fetchMock.mockImplementation(async () => make());
  vi.stubGlobal("fetch", fetchMock);
}

describe("apiGet", () => {
  it("prefixes the default base and builds a query string, dropping null/undefined/empty", async () => {
    mock(respond(200, '{"a":1}'));
    const out = await apiGet("/x", { a: "1", b: 2, c: true, d: null, e: undefined, f: "" });
    expect(out).toEqual({ a: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/x?a=1&b=2&c=true`);
  });
  it("adds no ? when there are no usable params", async () => {
    mock(respond(200, "{}"));
    await apiGet("/x", { d: null });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/x");
    await apiGet("/y");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/y");
  });
  it("honours an explicit base", async () => {
    mock(respond(200, "{}"));
    await apiGet("/x", undefined, "http://other");
    expect(fetchMock.mock.calls[0][0]).toBe("http://other/x");
  });
  it("throws ApiError carrying a string detail", async () => {
    mock(respond(404, '{"detail":"no such view"}'));
    const err = await fail(apiGet("/x"));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.message).toBe("no such view");
    expect(err.name).toBe("ApiError");
  });
  it("JSON-stringifies a structured detail", async () => {
    mock(respond(422, '{"detail":[{"loc":["body"],"msg":"bad"}]}'));
    const err = await fail(apiGet("/x"));
    expect(err.message).toBe('[{"loc":["body"],"msg":"bad"}]');
  });
  it("stringifies a JSON error body without detail", async () => {
    mock(respond(400, '{"error":"nope"}'));
    expect((await fail(apiGet("/x"))).message).toBe('{"error":"nope"}');
  });
  it("falls back to statusText, then HTTP status, for non-JSON bodies", async () => {
    mock(respond(502, "<html>", "Bad Gateway"));
    expect((await fail(apiGet("/x"))).message).toBe("Bad Gateway");
    mock(respond(500, "<html>", ""));
    expect((await fail(apiGet("/x"))).message).toBe("HTTP 500");
  });
});

describe("apiSend", () => {
  it("sends a JSON body with a content-type header", async () => {
    mock(respond(200, '{"id":"v1"}'));
    const out = await apiSend("POST", "/views", { name: "n" });
    expect(out).toEqual({ id: "v1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/views");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe('{"name":"n"}');
  });
  it("sends no header or body when body is undefined, and returns null for an empty response", async () => {
    mock(respond(200, ""));
    const out = await apiSend("DELETE", "/views/1", undefined, "http://other");
    expect(out).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://other/views/1");
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
  });
  it("throws ApiError on failure", async () => {
    mock(respond(409, '{"detail":"conflict"}'));
    const err = await fail(apiSend("PUT", "/views/1", {}));
    expect(err).toBeInstanceOf(ApiError);
    expect([err.status, err.message]).toEqual([409, "conflict"]);
  });
});
