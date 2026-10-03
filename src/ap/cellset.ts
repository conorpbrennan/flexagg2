// An MDX cellset becomes the tidy records the grid already reads. Pure. No arithmetic on cell values:
// a missing cell is null, never a sum or a fill.
import type { PivotResult, Rec } from "../api/types";
import type { RawCellSet, RawPosition } from "./client";
import { parseLevelKey } from "./discovery";
import { pathKey, type ApQuery } from "./mdx";

export const labelKey = (levelKey: string): string => `${levelKey}#label`;

const ALL = "AllMember";
const MEASURES_DIM = "Measures";

const hierId = (dim: string, hier: string): string => `[${dim}].[${hier}]`;

function axisHierarchies(hs: unknown[]): string[] {
  return hs.map((h) => {
    const o = h as { dimension?: unknown; hierarchy?: unknown } | null;
    if (!o || typeof o.dimension !== "string" || typeof o.hierarchy !== "string") {
      throw new Error("axis hierarchy without dimension and hierarchy names");
    }
    return hierId(o.dimension, o.hierarchy);
  });
}

// Level keys of one axis, grouped by hierarchy in the order given.
function levelsByHier(keys: string[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const k of keys) {
    const r = parseLevelKey(k);
    const h = hierId(r.dim, r.hier);
    m.set(h, [...(m.get(h) ?? []), k]);
  }
  return m;
}

// One axis position's contribution: for every level key of its hierarchy, the path and caption cut at depth.
function fieldsFor(member: RawPosition, keys: string[], depth: Record<string, number>): Rec {
  const skip = member.namePath[0] === ALL ? 1 : 0;
  const names = member.namePath.slice(skip);
  const caps = member.captionPath.slice(skip);
  const out: Rec = {};
  for (const k of keys) {
    const d = depth[k];
    if (d === undefined) throw new Error(`no depth for ${k}`);
    if (names.length < d) throw new Error(`path too short for ${k}`);
    out[k] = pathKey(names.slice(0, d));
    out[labelKey(k)] = caps[d - 1] ?? names[d - 1];
  }
  return out;
}

// Per position, the fields of every non-measure hierarchy. `skipMeasures` drops the measures hierarchy of the
// column axis and returns the measure name beside the fields.
function axisFields(
  cs: RawCellSet,
  id: 0 | 1,
  keys: string[],
  depth: Record<string, number>,
): { fields: Rec; measure?: string }[] {
  const axis = cs.axes.find((a) => a.id === id);
  const want = levelsByHier(keys);
  const name = id === 0 ? "columns" : "rows";
  if (!axis) {
    if (id === 1 && want.size === 0) return [{ fields: {} }];
    throw new Error(`no ${name} axis in cellset`);
  }
  const hs = axisHierarchies(axis.hierarchies);
  for (const h of want.keys()) if (!hs.includes(h)) throw new Error(`hierarchy missing from ${name} axis: ${h}`);
  for (const h of hs) {
    if (id === 0 && h.startsWith(`[${MEASURES_DIM}].`)) continue;
    if (!want.has(h)) throw new Error(`unexpected hierarchy on ${name} axis: ${h}`);
  }
  return axis.positions.map((pos) => {
    const fields: Rec = {};
    let measure: string | undefined;
    pos.forEach((member, i) => {
      if (id === 0 && hs[i].startsWith(`[${MEASURES_DIM}].`)) {
        measure = member.namePath[0];
      } else {
        Object.assign(fields, fieldsFor(member, want.get(hs[i]) as string[], depth));
      }
    });
    return { fields, measure };
  });
}

export function cellsetToRecords(cs: RawCellSet, q: ApQuery): Rec[] {
  const rows = axisFields(cs, 1, q.rows, q.depth);
  const cols = axisFields(cs, 0, q.cols, q.depth);
  const nCols = cols.length;

  // Column positions sharing the same col-level members form one record; each knows where its measures sit.
  const groups = new Map<string, { fields: Rec; at: Map<string, number> }>();
  cols.forEach((c, j) => {
    if (c.measure === undefined) throw new Error("column position without a measure");
    if (!q.measures.includes(c.measure)) throw new Error(`unexpected measure: ${c.measure}`);
    const gk = JSON.stringify(c.fields);
    let g = groups.get(gk);
    if (!g) groups.set(gk, (g = { fields: c.fields, at: new Map() }));
    g.at.set(c.measure, j);
  });

  const cells = new Map<number, unknown>();
  for (const cell of cs.cells) cells.set(cell.ordinal, cell.value);

  const out: Rec[] = [];
  rows.forEach((r, i) => {
    for (const g of groups.values()) {
      const rec: Rec = { ...r.fields, ...g.fields };
      for (const m of q.measures) {
        const j = g.at.get(m);
        const v = j === undefined ? undefined : cells.get(j + i * nCols);
        rec[m] = typeof v === "number" || typeof v === "string" ? v : null;
      }
      out.push(rec);
    }
  });
  return out;
}

export function toPivotResult(
  parts: { body: RawCellSet; perRow?: RawCellSet; perCol?: RawCellSet; grand?: RawCellSet },
  q: ApQuery,
): PivotResult {
  const res: PivotResult = {
    rows: q.rows,
    cols: q.cols,
    measures: q.measures,
    totals: Boolean(parts.perRow || parts.perCol || parts.grand),
    warning: null,
    records: cellsetToRecords(parts.body, q),
  };
  if (parts.perRow) res.per_row = cellsetToRecords(parts.perRow, { ...q, cols: [] });
  if (parts.perCol) res.per_col = cellsetToRecords(parts.perCol, { ...q, rows: [] });
  if (parts.grand) {
    const rec = cellsetToRecords(parts.grand, { ...q, rows: [], cols: [] })[0] ?? {};
    const g: Record<string, number | null> = {};
    for (const m of q.measures) g[m] = typeof rec[m] === "number" ? (rec[m] as number) : null;
    res.grand = g;
  }
  return res;
}
