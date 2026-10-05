// Pivot workspace state + the hand-rolled server-side drill (docs/vite-ui-plan.md §5).
//
// INVARIANT: the grid is a pure renderer. Every reshape and every drill is an ActivePivot MDX query
// (src/ap/pivotSource.ts) behind the browser-side guards; the browser never groups, sums, or pivots
// numbers itself. VaR is non-additive, so the only totals we render are the cube's own margins.
//
// The drill is lazy: the base query asks rows=[rowDims[0]] (+ an optional single col dim) and shows
// one row per top member. Expanding a row issues a fresh query for the NEXT row dim, filtered to the
// parent's member path, and splices the returned children underneath (indented). Collapsing drops them.
// Row/col/filter keys are level keys ("[dim].[hier].[level]"); a member is a path string (see mdx.ts).
import { useCallback, useMemo, useRef, useState } from "react";
import type { PivotResult, Rec, SortItem } from "../api/types";
import { BINDINGS, DEFAULT_ROWS } from "../ap/bindings";
import { labelKey } from "../ap/cellset";
import type { CubeModel } from "../ap/discovery";
import { parseLevelKey } from "../ap/discovery";
import { checkQuery, type GuardResult, type GuardRules } from "../ap/guards";
import { fetchPivotLevel, makeArgs, toApQuery, type PivotArgs } from "../ap/pivotSource";

export const COL_SEP = "␟"; // separates colMember from measure in a value key
export const TOTAL_COL = "Total"; // the col member carrying the per-row cube margin (Total column)
export const LABEL_COL = "__label";

export interface PivotConfig {
  rows: string[];
  cols: string[];          // 0 or 1 col dim supported in the grid (layout transpose)
  measures: string[];
  filters: Record<string, string[]>;
  // Streamlit's names: col_tot = the Total ROW (∑ over rows: the cube's per_col / grand margin,
  // pinned bottom), row_tot = the Total COLUMN (∑ over columns: per_row margin; needs a col dim).
  totals: boolean;         // <- view `col_tot` (Total row)
  rowTot: boolean;         // <- view `row_tot` (Total column)
  hideEmpty: boolean;      // <- view `hide_empty`: drop all-blank body rows / columns, keep totals
  heat: boolean;
  asPct: boolean;
  prec: number;
  units: "weight" | "dollar";   // <- view `units`: dollar = weight-unit measures × Manager MV (re-query)
  sort: SortItem[];        // <- view `sort`, Streamlit colIds (see sortKeyFor / sortIdFor)
}

// What a query needs besides the config: the cube's shape and the guard rules. Either null = not loaded
// yet, and nothing is fetched (a pivot never runs unguarded).
export interface PivotSrc {
  model: CubeModel | null;
  rules: GuardRules | null;
}

export interface DisplayRow {
  key: string;
  label: string;
  level: number;
  path: Record<string, string>;
  values: Record<string, number | null>;
  expandable: boolean;
  expanded: boolean;
}

const hierOf = (key: string): string | null => {
  try {
    const r = parseLevelKey(key);
    return `${r.dim}\u0000${r.hier}`;
  } catch {
    return null;
  }
};

// Pin the drill path onto the base filters. Two filters on one hierarchy are refused by buildMdx, and a
// deeper path entry already carries its parents, so each path entry REPLACES every other filter on its
// hierarchy (the parent's, a shallower or deeper user filter): the deepest path entry wins.
export function mergeFilters(base: Record<string, string[]>, path: Record<string, string>) {
  const f = { ...base };
  for (const [k, v] of Object.entries(path)) {
    const h = hierOf(k);
    if (h !== null) for (const other of Object.keys(f)) if (other !== k && hierOf(other) === h) delete f[other];
    f[k] = [v];
  }
  return f;
}

// The Units context a query runs under: dollar adds the Units "$" filter, weight adds nothing. Shared by the
// grid (queryLevel) and chart mode so both show the same units.
export function withUnits(filters: Record<string, string[]>, units: PivotConfig["units"]) {
  return units === "dollar" ? { ...filters, [BINDINGS.units]: ["$"] } : filters;
}

function levelArgs(
  cfg: PivotConfig, levelDims: string[], path: Record<string, string>, model: CubeModel, totals: boolean,
): PivotArgs {
  const colDim = cfg.cols[0];
  const filters = withUnits(mergeFilters(cfg.filters, path), cfg.units);
  // the Total column is the cube's per_row margin at THIS level (rows = the row dims), so it is
  // requested with the level query itself — never summed client-side (VaR is non-additive)
  return makeArgs(model, {
    rows: levelDims, cols: colDim ? [colDim] : [], measures: cfg.measures, filters,
    totals, rowTot: cfg.rowTot && !!colDim,
  });
}

async function queryLevel(
  cfg: PivotConfig, levelDims: string[], path: Record<string, string>, src: { model: CubeModel; rules: GuardRules },
  totals: boolean, signal?: AbortSignal,
): Promise<PivotResult> {
  return fetchPivotLevel(levelArgs(cfg, levelDims, path, src.model, totals), src.rules, BINDINGS, signal);
}

// The guard check Apply would run on this config: the base level reload() sends (first row field, no drill
// path), so the field list can show a refusal or notice while the zones are edited. null when there is
// nothing to check: no model or rules yet, or a config reload() rejects before querying. Never throws: it runs
// during render, and checkQuery throws on a malformed level key (a drill link or saved view can carry one),
// so a throw becomes the refusal Apply would show (reload() reports the same message).
export function guardPreview(cfg: PivotConfig, model: CubeModel | null, rules: GuardRules | null): GuardResult | null {
  if (!model || !rules || !cfg.rows.length || !cfg.measures.length) return null;
  try {
    return checkQuery(toApQuery(levelArgs(cfg, [cfg.rows[0]], {}, model, cfg.totals)), rules, BINDINGS);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---- sort: Streamlit colId <-> grid value key -------------------------------------------------
// Streamlit saves a measure column as "<measure>" (or "<measure> (%)" under its % toggle), a
// column-dim cell as "<col member> / <measure>", and the label column as the row dim name.
export function sortKeyFor(id: string, cfg: PivotConfig): string | null {
  const norm = id.endsWith(" (%)") ? id.slice(0, -4) : id;
  if (norm === LABEL_COL || cfg.rows.includes(norm)) return LABEL_COL;
  if (cfg.measures.includes(norm)) return `${COL_SEP}${norm}`;
  const i = norm.indexOf(" / ");
  if (i > 0) {
    const a = norm.slice(0, i), b = norm.slice(i + 3);
    if (cfg.measures.includes(b)) return `${a}${COL_SEP}${b}`;
    if (cfg.measures.includes(a)) return `${b}${COL_SEP}${a}`;
  }
  if (norm.includes(COL_SEP)) return norm;     // already a grid key
  return null;
}
export function sortIdFor(key: string, cfg: PivotConfig): string {
  if (key === LABEL_COL) return cfg.rows[0] ?? LABEL_COL;
  const i = key.indexOf(COL_SEP);
  const cm = key.slice(0, i), m = key.slice(i + 1);
  return cm ? `${cm} / ${m}` : m;
}

// order siblings by the saved sort (nulls last, ties keep cube order); pure, unit-tested
export function sortSiblings(rows: DisplayRow[], sort: SortItem[], cfg: PivotConfig): DisplayRow[] {
  const items = [...sort].filter((s) => s.sort).sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  const keys = items.map((s) => ({ key: sortKeyFor(s.colId, cfg), dir: s.sort === "desc" ? -1 : 1 }))
    .filter((k): k is { key: string; dir: 1 | -1 } => !!k.key);
  if (!keys.length) return rows;
  const idx = new Map(rows.map((r, i) => [r.key, i]));
  return [...rows].sort((a, b) => {
    for (const { key, dir } of keys) {
      if (key === LABEL_COL) {
        const c = a.label.localeCompare(b.label, undefined, { numeric: true });
        if (c) return c * dir;
        continue;
      }
      const va = a.values[key], vb = b.values[key];
      const na = typeof va !== "number", nb = typeof vb !== "number";
      if (na && nb) continue;
      if (na) return 1;             // blanks last whichever direction
      if (nb) return -1;
      if (va !== vb) return (va - vb) * dir;
    }
    return idx.get(a.key)! - idx.get(b.key)!;
  });
}

const isBlank = (r: DisplayRow) => !Object.values(r.values).some((v) => typeof v === "number");

// Collapse the tidy records for one drill level into display rows keyed by the member of `dim`.
export function rowsFromRecords(records: Rec[], dim: string, colDim: string | undefined,
  measures: string[], level: number, parentPath: Record<string, string>,
  parentKey: string, expandable: boolean, perRow?: Rec[]): DisplayRow[] {
  const byMember = new Map<string, DisplayRow>();
  for (const rec of records) {
    const member = String(rec[dim] ?? "");
    if (member === "") continue;
    const key = `${parentKey}/${member}`;
    let row = byMember.get(member);
    if (!row) {
      row = {
        key, label: String(rec[labelKey(dim)] ?? member), level,
        path: { ...parentPath, [dim]: member },
        values: {}, expandable, expanded: false,
      };
      byMember.set(member, row);
    }
    const colMember = colDim ? String(rec[colDim] ?? "") : "";
    for (const m of measures) {
      const v = rec[m];
      row.values[`${colMember}${COL_SEP}${m}`] = typeof v === "number" ? v : null;
    }
  }
  // the Total column: the cube's per_row margin for each member (keyed on `dim`)
  for (const rec of perRow ?? []) {
    const row = byMember.get(String(rec[dim] ?? ""));
    if (!row) continue;
    for (const m of measures) {
      const v = rec[m];
      row.values[`${TOTAL_COL}${COL_SEP}${m}`] = typeof v === "number" ? v : null;
    }
  }
  return [...byMember.values()];
}

export function usePivot(initial: Partial<PivotConfig>, src: PivotSrc) {
  const { model, rules } = src;
  const [cfg, setCfg] = useState<PivotConfig>({
    rows: DEFAULT_ROWS, cols: [], measures: ["Net exposure"], filters: {},
    totals: true, rowTot: false, hideEmpty: true, heat: true, asPct: false, prec: 3, sort: [],
    units: "dollar", ...initial,
  });

  const [tree, setTree] = useState<Record<string, DisplayRow[]>>({}); // parentKey -> children
  const [topRows, setTopRows] = useState<DisplayRow[]>([]);
  const [colMembers, setColMembers] = useState<string[]>([""]);
  const [grand, setGrand] = useState<Record<string, number | null>>({});
  const [dollarMeasures, setDollarMeasures] = useState<string[]>([]);  // what the query priced in $
  const [colCaptions, setColCaptions] = useState<Record<string, string>>({}); // col member path -> label
  // level key -> discovery caption, for the grid's headers
  const levelCaptions = useMemo(
    () => Object.fromEntries((model?.levels ?? []).map((l) => [l.key, l.caption])) as Record<string, string>,
    [model],
  );
  const captions = useMemo(() => ({ ...levelCaptions, ...colCaptions }), [levelCaptions, colCaptions]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Staleness control. `epoch` bumps when a reload starts and again when it commits, so a late
  // reload or expand (even one whose fetch ignores abort) fails its check and never writes.
  // `applied` is the config that produced the displayed rows: drills use it, not the live cfg.
  const epoch = useRef(0);
  const reloadSeq = useRef(0);
  const inflight = useRef(new Set<AbortController>());
  const applied = useRef<PivotConfig | null>(null);
  const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

  // (re)load the base level + reset the tree. Called on Apply.
  const reload = useCallback(async (override?: PivotConfig) => {
    const c = override ?? cfg;
    if (!model || !rules) return;   // guard rules / cube shape not loaded: wait, never run unguarded
    for (const ac of inflight.current) ac.abort();   // supersede the previous reload and any expands,
    inflight.current.clear();                        // including when this config is invalid
    const mine = ++epoch.current, seq = ++reloadSeq.current;
    if (!c.rows.length || !c.measures.length) {
      setLoading(false);
      setError("pick at least one row field and one measure");
      return;                                        // never applied: `applied` keeps the shown grid's config
    }
    const ac = new AbortController();
    inflight.current.add(ac);
    setLoading(true); setError(null);
    try {
      // one fetch carries the level AND its cube-computed margins (per_row, per_col, grand)
      const base = await queryLevel(c, [c.rows[0]], {}, { model, rules }, c.totals, ac.signal);
      if (epoch.current !== mine) return;   // superseded while in flight
      epoch.current++;                       // commit: invalidates expands begun against the old grid
      applied.current = c;
      const colDim = c.cols[0];
      const cms = colDim
        ? Array.from(new Set(base.records.map((r) => String(r[colDim] ?? "")))).filter(Boolean).sort()
        : [""];
      if (colDim) {
        const cc: Record<string, string> = {};
        for (const r of base.records) {
          const cm = String(r[colDim] ?? "");
          if (cm) cc[cm] = String(r[labelKey(colDim)] ?? cm);
        }
        setColCaptions(cc);
      } else setColCaptions({});
      if (colDim && c.rowTot) cms.push(TOTAL_COL);
      const expandable = c.rows.length > 1;
      const rows = rowsFromRecords(base.records, c.rows[0], colDim, c.measures, 0, {}, "", expandable,
        base.per_row);
      setColMembers(cms.length ? cms : [""]);
      setDollarMeasures(base.units === "dollar" ? (base.dollar_measures ?? []) : []);
      setTopRows(rows);
      setTree({});
      setWarning(base.warning);
      // the Total row: cube-computed margins only — the grand corner, plus per_col (one per col
      // member) when a column dim is on. Never a client-side sum.
      if (c.totals) {
        const gr: Record<string, number | null> = {};
        for (const m of c.measures) gr[`${COL_SEP}${m}`] = base.grand?.[m] ?? null;
        if (colDim) {
          for (const rec of base.per_col ?? []) {
            const cm = String(rec[colDim] ?? "");
            for (const m of c.measures) {
              const v = rec[m];
              gr[`${cm}${COL_SEP}${m}`] = typeof v === "number" ? v : null;
            }
          }
          for (const m of c.measures) gr[`${TOTAL_COL}${COL_SEP}${m}`] = base.grand?.[m] ?? null;
        }
        setGrand(gr);
      } else setGrand({});
    } catch (e) {
      if (reloadSeq.current === seq && !isAbort(e)) setError((e as Error).message);
    } finally {
      inflight.current.delete(ac);
      if (reloadSeq.current === seq) setLoading(inflight.current.size > 0);   // expands may still be pending
    }
  }, [cfg, model, rules]);

  const toggleExpand = useCallback(async (row: DisplayRow) => {
    const ac0 = applied.current;   // drill from the config that produced the rows, not unapplied edits
    if (!ac0 || !model || !rules) return;
    if (row.level >= ac0.rows.length - 1) return;
    if (tree[row.key]) {
      // collapse: drop children (and any deeper cached descendants stay cached but hidden)
      const flip = (rs: DisplayRow[]) => rs.map((r) => (r.key === row.key ? { ...r, expanded: false } : r));
      setTopRows((rs) => flip(rs));
      setTree((t) => {
        const nt = { ...t };
        // mark collapsed by removing the entry so flatten hides children
        delete nt[row.key];
        return nt;
      });
      return;
    }
    const mine = epoch.current;
    const ac = new AbortController();
    inflight.current.add(ac);
    setLoading(true);
    try {
      const nextDim = ac0.rows[row.level + 1];
      const res = await queryLevel(ac0, ac0.rows.slice(0, row.level + 2), row.path, { model, rules }, false, ac.signal);
      if (epoch.current !== mine) return;   // a reload landed or started meanwhile
      const expandable = row.level + 1 < ac0.rows.length - 1;
      const children = rowsFromRecords(res.records, nextDim, ac0.cols[0], ac0.measures,
        row.level + 1, row.path, row.key, expandable, res.per_row);
      setTree((t) => ({ ...t, [row.key]: children }));
      const setExpanded = (rs: DisplayRow[]) => rs.map((r) => (r.key === row.key ? { ...r, expanded: true } : r));
      setTopRows((rs) => setExpanded(rs));
    } catch (e) {
      if (epoch.current === mine && !isAbort(e)) setError((e as Error).message);
    } finally {
      inflight.current.delete(ac);
      setLoading(inflight.current.size > 0);   // spinner stays while any expand or the pending reload remains
    }
  }, [tree, model, rules]);

  // flatten the expanded tree into the ordered list AG Grid renders: siblings sorted by the
  // view's sort at EVERY level (the drill indentation survives a sort), all-blank body rows
  // dropped under hideEmpty (a parent with children showing is kept)
  const flat = useMemo(() => {
    const out: DisplayRow[] = [];
    const walk = (rows: DisplayRow[]) => {
      for (const r of sortSiblings(rows, cfg.sort, cfg)) {
        const expanded = !!tree[r.key];
        if (cfg.hideEmpty && isBlank(r) && !expanded) continue;
        out.push({ ...r, expanded });
        if (expanded) walk(tree[r.key]);
      }
    };
    walk(topRows);
    return out;
  }, [topRows, tree, cfg]);

  // hideEmpty also drops all-blank body COLUMNS (col members with no number in any shown row);
  // the Total column is kept, like Streamlit keeps total rows/cols
  const shownColMembers = useMemo(() => {
    if (!cfg.hideEmpty || colMembers.length <= 1) return colMembers;
    const kept = colMembers.filter((cm) => cm === TOTAL_COL || cm === ""
      || flat.some((r) => cfg.measures.some((m) => typeof r.values[`${cm}${COL_SEP}${m}`] === "number")));
    return kept.length ? kept : [""];
  }, [cfg.hideEmpty, cfg.measures, colMembers, flat]);

  return {
    cfg, setCfg, reload, toggleExpand,
    flat, colMembers: shownColMembers, grand, dollarMeasures, captions, warning, loading, error,
  };
}
