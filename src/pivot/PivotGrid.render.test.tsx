// PivotGrid is a pure renderer over AG Grid. AG Grid is replaced by a stub that records its props, so
// the column defs, formatters, cell styles, pinned total row and sort wiring can be exercised directly.
import { render, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

let props: any;
vi.mock("ag-grid-react", () => ({
  AgGridReact: (p: any) => { props = p; return <div data-testid="ag" />; },
}));

import { PivotGrid } from "./PivotGrid";
import { COL_SEP, LABEL_COL, type DisplayRow, type PivotConfig } from "./usePivot";

const COUNTRY = "[Securities].[Security].[Country]";
const cfg: PivotConfig = {
  rows: [COUNTRY], cols: [], measures: ["Net exposure", "Market value"], filters: {}, totals: true, rowTot: false,
  hideEmpty: true, heat: true, asPct: false, prec: 2, sort: [], units: "weight",
};
const K = (m: string) => `${COL_SEP}${m}`;
const row = (key: string, label: string, v: Record<string, number | null>, o: Partial<DisplayRow> = {}): DisplayRow => ({
  key, label, level: 0, path: {}, values: v, expandable: false, expanded: false, ...o,
});
const flat = [
  row("US", "United States", { [K("Net exposure")]: 10, [K("Market value")]: 1500 }, { expandable: true }),
  row("UK", "United Kingdom", { [K("Net exposure")]: -20, [K("Market value")]: null }, { level: 1, expandable: true, expanded: true }),
];

function mount(over: Partial<React.ComponentProps<typeof PivotGrid>> = {}) {
  const onToggle = vi.fn(), onSort = vi.fn();
  const r = render(
    <PivotGrid flat={flat} colMembers={[]} measures={cfg.measures} cfg={cfg}
      grand={{ [K("Net exposure")]: 5 }} onToggle={onToggle} onSort={onSort} {...over} />,
  );
  return { ...r, onToggle, onSort };
}
const col = (id: string) => props.columnDefs.find((c: any) => c.colId === id);

beforeEach(() => { props = undefined; });

describe("PivotGrid columns", () => {
  it("builds a pinned label column headed by the row captions plus one column per measure", () => {
    mount({ captions: { [COUNTRY]: "Country" } });
    expect(props.columnDefs.map((c: any) => c.headerName)).toEqual(["Country", "Net exposure", "Market value"]);
    expect(props.columnDefs[0].pinned).toBe("left");
    expect(props.columnDefs[0].colId).toBe(LABEL_COL);
  });

  it("label cells show a caret by state, indent by level, and toggle only when expandable", () => {
    const { onToggle } = mount();
    const cell = (r: any) => render(props.columnDefs[0].cellRenderer({ data: { __row: r, __label: r.label }, value: r.label })).container;
    const us = cell(flat[0]);
    expect(us.textContent).toBe("▸United States");
    const uk = cell(flat[1]);
    expect(uk.textContent).toBe("▾United Kingdom");
    expect((uk.firstElementChild as HTMLElement).style.paddingLeft).toBe("14px");
    fireEvent.click(us.firstElementChild!);
    expect(onToggle).toHaveBeenCalledWith(flat[0]);
    const leaf = cell(row("x", "Leaf", {}));
    expect(leaf.textContent).toBe("Leaf");
    fireEvent.click(leaf.firstElementChild!);
    expect(onToggle).toHaveBeenCalledTimes(1);
    // the Total row is bold
    const tot = render(props.columnDefs[0].cellRenderer({ data: { __label: "Total (manager)", __total: true }, value: "Total (manager)" })).container;
    expect((tot.firstElementChild as HTMLElement).style.fontWeight).toBe("600");
  });

  it("values are read by literal key (dotted measure names) and null for a missing row", () => {
    mount();
    const c = col(K("Net exposure"));
    expect(c.valueGetter({ data: { [K("Net exposure")]: 10 } })).toBe(10);
    expect(c.valueGetter({ data: undefined })).toBeNull();
  });

  it("formats weight measures with prec, dollar measures and Market value as money, blanks as empty", () => {
    mount({ dollarMeasures: ["Net exposure"] });
    expect(col(K("Net exposure")).valueFormatter({ value: 1234.5 })).toBe("$1,235");
    expect(col(K("Market value")).valueFormatter({ value: 1500 })).toBe("$1,500");
    mount();
    expect(col(K("Net exposure")).valueFormatter({ value: 0.5 })).toBe("0.50");
    expect(col(K("Net exposure")).valueFormatter({ value: null })).toBe("");
  });

  it("heatmap: blue for positives, red for negatives, scaled within the column; none for non-numbers or when heat is off", () => {
    mount();
    const style = col(K("Net exposure")).cellStyle;
    expect(style({ value: 10 }).backgroundColor).toBe("rgba(59,94,140,0.150)");   // 10 / max|20| = 0.5
    expect(style({ value: -20 }).backgroundColor).toBe("rgba(163,50,43,0.260)");  // full scale
    expect(style({ value: null })).toEqual({ fontVariantNumeric: "tabular-nums" });
    mount({ cfg: { ...cfg, heat: false } });
    expect(col(K("Net exposure")).cellStyle({ value: 10 })).toEqual({ fontVariantNumeric: "tabular-nums" });
  });

  it("column members become '<member> · <measure>' columns", () => {
    mount({ colMembers: ["US", "UK"], measures: ["Net exposure"], captions: { US: "United States" } });
    expect(props.columnDefs.slice(1).map((c: any) => c.headerName)).toEqual(["United States · Net exposure", "UK · Net exposure"]);
  });

  it("the comparator reproduces the tree order, flipping for desc", () => {
    mount();
    const cmp = props.columnDefs[0].comparator;
    const a = { data: { __ord: 1 } }, b = { data: { __ord: 3 } };
    expect(cmp(0, 0, a, b, false)).toBe(-2);
    expect(cmp(0, 0, a, b, true)).toBe(2);
  });
});

describe("PivotGrid rows and total", () => {
  it("rowData carries the display rows in order with null for missing values", () => {
    mount();
    expect(props.rowData.map((r: any) => [r.__label, r.__ord, r[K("Market value")]])).toEqual([
      ["United States", 0, 1500], ["United Kingdom", 1, null],
    ]);
  });

  it("pins the cube's grand row as the only total, with null where the cube gave none", () => {
    mount();
    expect(props.pinnedBottomRowData).toHaveLength(1);
    const t = props.pinnedBottomRowData[0];
    expect(t.__label).toBe("Total (manager)");
    expect(t[K("Net exposure")]).toBe(5);
    expect(t[K("Market value")]).toBeNull();
  });

  it("the Total column of the grand row falls back to the no-column-member grand value", () => {
    mount({ colMembers: ["Total"], measures: ["Net exposure"], grand: { [K("Net exposure")]: 7 } });
    expect(props.pinnedBottomRowData[0][`Total${COL_SEP}Net exposure`]).toBe(7);
  });

  it("no pinned row when totals are off or the cube returned no grand", () => {
    mount({ cfg: { ...cfg, totals: false } });
    expect(props.pinnedBottomRowData).toEqual([]);
    mount({ grand: {} });
    expect(props.pinnedBottomRowData).toEqual([]);
  });

  it("remounts the grid when the column structure changes, not when the drill state does", () => {
    const { rerender, onToggle } = mount();
    const first = props.rowData;
    rerender(<PivotGrid flat={[flat[0]]} colMembers={[]} measures={cfg.measures} cfg={cfg} grand={{}} onToggle={onToggle} />);
    expect(props.rowData).not.toBe(first);
    expect(props.rowData).toHaveLength(1);
  });
});

describe("PivotGrid sort wiring", () => {
  it("applies the saved sort to the grid on ready, mapping Streamlit colIds to grid keys", () => {
    mount({ cfg: { ...cfg, sort: [{ colId: "Net exposure", sort: "desc", sortIndex: 0 }, { colId: "Unknown", sort: "asc" }] } });
    const applyColumnState = vi.fn();
    props.onGridReady({ api: { applyColumnState } });
    expect(applyColumnState).toHaveBeenCalledWith({
      state: [{ colId: K("Net exposure"), sort: "desc", sortIndex: 0 }],
      defaultState: { sort: null },
    });
  });

  it("a header click reports the sort in Streamlit colIds, ordered by sortIndex", () => {
    const { onSort } = mount();
    const api = { getColumnState: () => [
      { colId: K("Net exposure"), sort: "asc", sortIndex: 1 },
      { colId: LABEL_COL, sort: "desc", sortIndex: 0 },
      { colId: K("Market value"), sort: null },
    ] };
    props.onSortChanged({ api });
    expect(onSort).toHaveBeenCalledWith([
      { colId: COUNTRY, sort: "desc", sortIndex: 0 },
      { colId: "Net exposure", sort: "asc", sortIndex: 1 },
    ]);
  });

  it("does not report a sort that equals the current one", () => {
    const { onSort } = mount({ cfg: { ...cfg, sort: [{ colId: "Net exposure", sort: "asc", sortIndex: 0 }] } });
    props.onSortChanged({ api: { getColumnState: () => [{ colId: K("Net exposure"), sort: "asc", sortIndex: 0 }] } });
    expect(onSort).not.toHaveBeenCalled();
  });
});
