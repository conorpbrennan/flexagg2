// Guarded single-manager state (multi-manager Phase 4): a manager_mismatch payload from
// /universe, /funnel, /span, /drift, /pnl_attribution* must render as a quiet informational note
// — never an empty chart, a spinner forever, or a crash trying to read fields the mismatch shape
// doesn't have. Pure-render — no API, no QueryClient (a hand-built UseQueryResult-shaped stub is
// enough since GuardedQueryState/QueryState only read isLoading/isError/data/error off it).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { GuardedQueryState, isManagerMismatch, ManagerMismatchNotice, QueryState, RagDot, Field, H2, HowToRead } from "./ui";
import type { ManagerMismatch } from "../api/types";

const MISMATCH: ManagerMismatch = {
  status: "manager_mismatch", kind: "funnel", requested_manager: "TigerGlobal",
  artifact_manager: "Soros", basis: "inferred from the live positions frame (exactly one Manager present)",
  reason: "the funnel artifact was computed for the 'Soros' manager, not 'TigerGlobal' — serving it "
    + "under another manager's label would be silently wrong data, not just stale data",
};

interface Happy { note: string }
const HAPPY: Happy = { note: "all good" };

function stubQuery<T>(data: T | undefined, opts?: { isLoading?: boolean; isError?: boolean; error?: Error }) {
  return {
    data, isLoading: opts?.isLoading ?? false, isError: opts?.isError ?? false,
    error: opts?.error ?? null,
  } as unknown as UseQueryResult<T>;
}

describe("isManagerMismatch", () => {
  it("recognizes the exact manager_mismatch shape", () => {
    expect(isManagerMismatch(MISMATCH)).toBe(true);
  });
  it("is false for a normal payload, null, and undefined", () => {
    expect(isManagerMismatch(HAPPY)).toBe(false);
    expect(isManagerMismatch(null)).toBe(false);
    expect(isManagerMismatch(undefined)).toBe(false);
  });
});

describe("ManagerMismatchNotice", () => {
  it("names both the covered manager and the requested one, and states the reason — no alarm class", () => {
    const { container, getByText } = render(<ManagerMismatchNotice m={MISMATCH} />);
    const strongs = [...container.querySelectorAll("strong")].map((s) => s.textContent);
    expect(strongs).toEqual(["Soros", "TigerGlobal"]);   // covered manager, then requested manager
    getByText(/serving it under another manager's label would be silently wrong data/);
    // restrained typography: an informational state, not an error (never the red .err class)
    const p = container.querySelector("p")!;
    expect(p.className).toBe("muted small");
  });
});

describe("GuardedQueryState", () => {
  it("renders the informational notice instead of the happy-path children on a manager_mismatch", () => {
    const q = stubQuery<Happy>(MISMATCH as unknown as Happy);
    const { getByText, queryByText } = render(
      <GuardedQueryState q={q}>{(d) => <div>{d.note}</div>}</GuardedQueryState>,
    );
    getByText(/not available for/);
    expect(queryByText("all good")).toBeNull();     // never falls through to the happy render
  });

  it("renders the happy-path children unchanged when the payload is normal", () => {
    const q = stubQuery<Happy>(HAPPY);
    const { getByText, queryByText } = render(
      <GuardedQueryState q={q}>{(d) => <div>{d.note}</div>}</GuardedQueryState>,
    );
    getByText("all good");
    expect(queryByText(/not available for/)).toBeNull();
  });

  it("still loads/errors like plain QueryState (no crash, no silent blank on missing data)", () => {
    const loading = stubQuery<Happy>(undefined, { isLoading: true });
    const { getByText } = render(
      <GuardedQueryState q={loading}>{(d) => <div>{d.note}</div>}</GuardedQueryState>,
    );
    getByText("loading…");
  });
});

describe("QueryState", () => {
  it("shows the error message in the error style", () => {
    const { getByText } = render(
      <QueryState q={stubQuery<Happy>(undefined, { isError: true, error: new Error("boom") })}>{() => <div />}</QueryState>,
    );
    expect(getByText("error: boom").className).toBe("err small");
  });
  it("falls back to 'failed' when the error has no message", () => {
    const q = { data: undefined, isLoading: false, isError: true, error: null } as unknown as UseQueryResult<Happy>;
    const { container } = render(<QueryState q={q}>{() => <div />}</QueryState>);
    expect(container.textContent).toBe("error: failed");
  });
  it("shows 'no data' by default, or the custom empty node, when there is no data", () => {
    const a = render(<QueryState q={stubQuery<Happy>(undefined)}>{() => <div />}</QueryState>);
    expect(a.container.textContent).toBe("no data");
    const b = render(<QueryState q={stubQuery<Happy>(undefined)} empty={<i>nothing here</i>}>{() => <div />}</QueryState>);
    expect(b.getByText("nothing here")).toBeInTheDocument();
  });
  it("keeps showing data while a refetch is loading (spinner only when there is no data yet)", () => {
    const { getByText, queryByText } = render(
      <QueryState q={stubQuery<Happy>(HAPPY, { isLoading: true })}>{(d) => <div>{d.note}</div>}</QueryState>,
    );
    getByText("all good");
    expect(queryByText("loading…")).toBeNull();
  });
});

describe("small atoms", () => {
  it("RagDot maps status to a class and uses the title, else the status, as its tooltip", () => {
    const a = render(<RagDot status="breach" />).container.firstElementChild!;
    expect(a.className).toBe("dot rag-red");
    expect(a.getAttribute("title")).toBe("breach");
    const b = render(<RagDot status="warn" title="near limit" />).container.firstElementChild!;
    expect(b.className).toBe("dot rag-amber");
    expect(b.getAttribute("title")).toBe("near limit");
    const c = render(<RagDot status={null} />).container.firstElementChild!;
    expect(c.className).toBe("dot muted");
    expect(c.getAttribute("title")).toBe("");
  });
  it("Field labels its control; H2 renders a heading", () => {
    const { getByText, getByRole } = render(<><Field label="As-of"><input /></Field><H2>Title</H2></>);
    expect(getByText("As-of").tagName).toBe("LABEL");
    expect(getByRole("heading", { level: 2 }).textContent).toBe("Title");
  });
  it("HowToRead is a closed disclosure holding its content", () => {
    const { container, getByText } = render(<HowToRead>the formula</HowToRead>);
    const d = container.querySelector("details")!;
    expect(d.open).toBe(false);
    expect(getByText("How to read this").tagName).toBe("SUMMARY");
    expect(getByText("the formula")).toBeInTheDocument();
  });
  it("ManagerMismatchNotice shows an em dash when the artifact manager is unknown", () => {
    const { container } = render(<ManagerMismatchNotice m={{ ...MISMATCH, artifact_manager: null as unknown as string }} />);
    expect(container.querySelectorAll("strong")[0].textContent).toBe("—");
  });
});
