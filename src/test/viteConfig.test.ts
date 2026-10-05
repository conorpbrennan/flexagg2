// @vitest-environment node
// vite.config imports vite (esbuild), whose TextEncoder check fails under jsdom.
// The explicit .ts matters: tsc -b emits a git-ignored vite.config.js beside it, which would shadow it.
import { vendorChunk } from "../../vite.config.ts";

const nm = (pkg: string, file = "index.js") => `/repo/node_modules/${pkg}/build/${file}`;

describe("vendorChunk", () => {
  it("puts ag-grid and its React wrapper in one chunk", () => {
    expect(vendorChunk(nm("ag-grid-community"))).toBe("vendor-ag-grid");
    expect(vendorChunk(nm("ag-grid-react"))).toBe("vendor-ag-grid");
  });

  it("gives React its own chunk, so the entry never pulls in vendor-ag-grid", () => {
    // Left unassigned, Rollup hoisted react-dom into vendor-ag-grid (via ag-grid-react) and index.html
    // preloaded the whole grid.
    expect(vendorChunk(nm("react"))).toBe("vendor-react");
    expect(vendorChunk(nm("react-dom"))).toBe("vendor-react");
    expect(vendorChunk(nm("scheduler"))).toBe("vendor-react");
    expect(vendorChunk(nm("react-router-dom"))).toBeUndefined();
  });

  it("splits the charting stack so no chunk carries all of vega", () => {
    expect(vendorChunk(nm("vega-lite"))).toBe("vendor-vega-lite");
    // vega-embed and vega-themes import vega-lite; in vendor-vega they made the two chunks import each other.
    expect(vendorChunk(nm("vega-embed"))).toBe("vendor-vega-lite");
    expect(vendorChunk(nm("vega-themes"))).toBe("vendor-vega-lite");
    expect(vendorChunk(nm("vega-tooltip"))).toBe("vendor-vega");
    expect(vendorChunk(nm("vega"))).toBe("vendor-vega");
    expect(vendorChunk(nm("vega-scenegraph"))).toBe("vendor-vega");
    expect(vendorChunk(nm("d3-geo"))).toBe("vendor-d3");
  });

  it("does not mistake a package that only starts with a vendor name", () => {
    expect(vendorChunk(nm("vegan"))).toBeUndefined();
    expect(vendorChunk(nm("d3fc"))).toBeUndefined();
  });

  it("leaves app code and other packages to the default chunking", () => {
    expect(vendorChunk("/repo/src/pivot/ChartMode.tsx")).toBeUndefined();
    expect(vendorChunk(nm("@dnd-kit/core"))).toBeUndefined();
    expect(vendorChunk(nm("@tanstack/query-core"))).toBeUndefined();
  });

  it("leaves vendor CSS to the default chunking", () => {
    // main.tsx imports ag-grid's CSS globally; in vendor-ag-grid it made the entry import the grid's JS.
    expect(vendorChunk(nm("ag-grid-community", "../styles/ag-grid.css"))).toBeUndefined();
  });

  it("matches Windows-style paths", () => {
    expect(vendorChunk("C:\\repo\\node_modules\\ag-grid-community\\dist\\x.js")).toBe("vendor-ag-grid");
  });
});
