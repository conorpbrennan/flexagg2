// Pivot workspace (docs/vite-ui-plan.md §5): the Excel-style field list, the server-driven drill
// grid (or chart mode) and the saved-view Repository. The grid is a pure renderer — every number comes
// from an ActivePivot query behind the browser-side guards (src/ap/pivotSource.ts).
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useDims } from "../api/hooks";
import { BINDINGS, DEFAULT_ROWS, checkBindings, contextFilters } from "../ap/bindings";
import { useCubeModel } from "../ap/discovery";
import { useGuardRules } from "../ap/guards";
import { guardPreview, usePivot, type PivotConfig } from "../pivot/usePivot";
import { FieldList, type GuardLine } from "../pivot/FieldList";
import { PivotGrid } from "../pivot/PivotGrid";
// Vega is ~heavy; only load it when the user switches to chart mode.
const ChartMode = lazy(() => import("../pivot/ChartMode").then((m) => ({ default: m.ChartMode })));
import { Repository } from "../pivot/Repository";
import { QueryState } from "../components/ui";
import type { ViewState } from "../api/types";

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function Pivot() {
  const { date, scenario, manager } = useApp();
  const dimsQ = useDims();
  const model = useCubeModel().data ?? null;
  const rules = useGuardRules(); // null until /dims and /meta have loaded: no query runs before that
  const missing = model ? checkBindings(model) : [];
  const [mode, setMode] = useState<"grid" | "chart">("grid");
  const [showRepo, setShowRepo] = useState(false);
  // the currently-loaded saved view (name + its description), shown in the bottom description pane
  const [loadedView, setLoadedView] = useState<{ name: string; description?: string } | null>(null);
  // the loaded view's full saved state: fields Vite has no control for (date_fmt, chart/queries)
  // ride along on save instead of being dropped by a Vite round-trip
  const [loadedState, setLoadedState] = useState<ViewState | null>(null);
  // a charted view is self-describing: its named queries + Vega-Lite spec(s), rendered verbatim
  const [chartView, setChartView] = useState<Pick<ViewState, "queries" | "chart"> | null>(null);

  // seed the pivot filters from the global context bar (§9): Manager + Date + ScenarioSet, overridable.
  const ctxNow = contextFilters({ manager, date, scenario });
  // the context filters last folded into cfg.filters: a filter on a context level that differs from this
  // is the user's own (a picked member, a loaded view) and wins over the context.
  const folded = useRef<Record<string, string[]>>(ctxNow);
  const pivot = usePivot({
    rows: DEFAULT_ROWS, measures: ["Net exposure", "Scenario VaR 99"],
    filters: ctxNow,
    totals: true, rowTot: false, hideEmpty: true, heat: true, asPct: false, prec: 3, sort: [],
    units: "dollar",
  }, { model, rules });
  const { cfg, setCfg, reload, toggleExpand, flat, colMembers, grand, dollarMeasures, captions, warning, loading, error } = pivot;
  // The guard check Apply would run on the edited zones, shown live in the field list. Dropped when it
  // repeats the warning or error the page already shows (always the case right after Apply).
  const preview = useMemo(() => guardPreview(cfg, model, rules), [cfg, model, rules]);
  const live: GuardLine | null = !preview ? null
    : !preview.ok ? { level: "refuse", text: preview.error }
    : preview.notice ? { level: "notice", text: preview.notice } : null;
  const guardLine = live && live.text !== warning && live.text !== error ? live : null;

  // Cross-lens drill link (?drill=<json {rows, cols?, measures, filters}>, e.g. from the
  // Attribution reconcile drawer): captured ONCE at mount, consumed inside the fold effect below
  // so mount issues exactly one reload — a separate effect would race the fold's own reload and
  // the loser's response would clobber the grid (blank measure columns). Deliberately NOT an
  // effect dependency: consuming it must not re-trigger the fold.
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingDrill, setPendingDrill] = useState<
    (Partial<Pick<PivotConfig, "rows" | "cols" | "measures" | "filters">>
      & { description?: string }) | null>(() => {
    const raw = searchParams.get("drill");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  });

  // Reload whenever the cube and the guard rules are ready or the global context (manager / date /
  // scenario) changes, folding them into the pivot filters AND re-querying — so changing the scenario
  // dropdown updates the numbers immediately. ScenarioSet is only sliced when it is NOT already on an
  // axis: a view may put ScenarioSet on Rows/Columns to COMPARE across sets (e.g. Concentration — Risk
  // HHI), and those must not be collapsed to the single global set. Nothing runs before the guard rules
  // (and the cube model) have loaded.
  useEffect(() => {
    if (!dimsQ.data || !date || !model || !rules || missing.length > 0) return;
    if (pendingDrill) {
      const next: PivotConfig = { ...cfg,
        rows: pendingDrill.rows ?? cfg.rows, cols: pendingDrill.cols ?? [],
        measures: pendingDrill.measures ?? cfg.measures,
        filters: pendingDrill.filters ?? cfg.filters };
      setCfg(next);
      setMode("grid");
      reload(next);
      setLoadedView({ name: "drill-through",
        description: pendingDrill.description ?? "opened from another lens" });
      setPendingDrill(null);
      setSearchParams({}, { replace: true });
      return;
    }
    const ctx = contextFilters({ manager, date, scenario });
    if (cfg.rows.includes(BINDINGS.scenarioSet) || cfg.cols.includes(BINDINGS.scenarioSet)) {
      delete ctx[BINDINGS.scenarioSet];
    }
    const filters: Record<string, string[]> = { ...cfg.filters };
    for (const k of [BINDINGS.manager, BINDINGS.date, BINDINGS.scenarioSet]) {
      const cur = filters[k], prev = folded.current[k];
      if (cur && !(prev && sameList(cur, prev))) continue; // the user's own filter wins
      if (ctx[k]) filters[k] = ctx[k]; else delete filters[k];
    }
    folded.current = ctx;
    const next = { ...cfg, filters };
    setCfg(next);
    reload(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimsQ.data, date, scenario, manager, model, rules]);

  const loadViewState = (s: ViewState, name: string) => {
    // Build the next config explicitly and hand it straight to reload(). Do NOT rely on setCfg +
    // a deferred reload() — reload closes over the CURRENT-render cfg, so a bare reload() fired
    // before React re-renders would query with the *previous* view's config (the "first click shows
    // the wrong report, second click is right" bug). Passing `next` bypasses that stale closure.
    const rows = s.rows ?? cfg.rows, cols = s.cols ?? [];
    // saved views carry no folded context (see currentState): take the CURRENT context for every
    // context level the view does not filter itself, and record it as folded so it stays the context's
    const ctx = contextFilters({ manager, date, scenario });
    const scenOnAxis = rows.includes(BINDINGS.scenarioSet) || cols.includes(BINDINGS.scenarioSet);
    if (scenOnAxis) delete ctx[BINDINGS.scenarioSet];
    const filters: Record<string, string[]> = { ...(s.filters ?? cfg.filters) };
    // the fallback cfg.filters may hold the folded ScenarioSet slice: it must not survive onto an axis
    if (!s.filters && scenOnAxis) delete filters[BINDINGS.scenarioSet];
    for (const k of [BINDINGS.manager, BINDINGS.date, BINDINGS.scenarioSet]) {
      if (!filters[k] && ctx[k]) filters[k] = ctx[k];
    }
    folded.current = ctx;
    const next: PivotConfig = {
      ...cfg,
      rows, cols, measures: s.measures ?? cfg.measures,
      filters,
      // Streamlit's names: col_tot = Total ROW (the pinned grand/per_col margin), row_tot = Total
      // COLUMN (per_row margin, with a column dim). Pre-2026-08-21 Vite saves wrote the pinned
      // row as row_tot with no col_tot — read that form too.
      totals: s.col_tot ?? (s.row_tot && !s.cols?.length ? s.row_tot : cfg.totals),
      rowTot: s.col_tot !== undefined ? (s.row_tot ?? false) : false,
      hideEmpty: s.hide_empty ?? true,
      heat: s.heat ?? cfg.heat, asPct: s.as_pct ?? cfg.asPct, prec: s.prec ?? cfg.prec,
      sort: Array.isArray(s.sort) ? s.sort : [],
      // default $ in every report (2026-08-22); an explicit "weight" in a saved view still wins.
      units: s.units === "weight" ? "weight" : "dollar",
    };
    setCfg(next);
    setMode(s.render === "chart" ? "chart" : "grid");
    reload(next);
    setLoadedView({ name, description: s.description });
    setLoadedState(s);
    // capture the self-describing chart (queries + spec) so chart mode renders it verbatim
    setChartView(s.render === "chart" && s.chart ? { queries: s.queries, chart: s.chart } : null);
    document.title = `${name} · pivot`;
  };

  // the saved form mirrors Streamlit's read_pivot_state() field for field, so a view written
  // here loads identically in the Streamlit app (and vice versa)
  // Context values folded in from the context bar are NOT saved (a view would freeze the day it was
  // saved); a filter the user chose on a context level (a different value) is.
  const savedFilters = Object.fromEntries(Object.entries(cfg.filters).filter(([k, v]) => {
    const f = folded.current[k];
    return !(f && sameList(v, f));
  }));
  const currentState: ViewState = {
    ...(loadedState ?? {}),
    rows: cfg.rows, cols: cfg.cols, measures: cfg.measures, filters: savedFilters,
    slice_dims: Object.keys(savedFilters),
    row_tot: cfg.rowTot, col_tot: cfg.totals, as_pct: cfg.asPct, hide_empty: cfg.hideEmpty,
    heat: cfg.heat, prec: cfg.prec, sort: cfg.sort, units: cfg.units,
    render: mode, description: loadedView?.description,
  };


  // the view's display options — Streamlit's sidebar set — shown in the builder's Display zone
  const display = (
    <div className="small" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem 0.6rem" }}>
      <label className="row"><input type="checkbox" checked={cfg.heat} onChange={(e) => setCfg((c) => ({ ...c, heat: e.target.checked }))} /> heat</label>
      <label className="row" title="% and fraction are formats of the same weight-unit numbers; $ re-queries the cube's Units context (measure × Manager MV)">
        units <select value={cfg.units === "dollar" ? "$" : cfg.asPct ? "%" : "fraction"} style={{ width: "5.2rem" }}
          onChange={(e) => {
            const v = e.target.value;
            const next: PivotConfig = { ...cfg, units: v === "$" ? "dollar" : "weight", asPct: v === "%" || (v === "$" ? cfg.asPct : false) };
            setCfg(next);
            if (next.units !== cfg.units) reload(next);
          }}>
          <option value="%">%</option><option value="fraction">fraction</option><option value="$">$</option>
        </select></label>
      <label className="row" title="Total row — the cube's grand / per-column margin, pinned at the bottom">
        <input type="checkbox" checked={cfg.totals} onChange={(e) => { const next = { ...cfg, totals: e.target.checked }; setCfg(next); reload(next); }} /> total row</label>
      <label className="row" title="Total column — the cube's per-row margin across the column dim (needs a column field)"
        style={{ opacity: cfg.cols.length ? 1 : 0.45 }}>
        <input type="checkbox" checked={cfg.rowTot} disabled={!cfg.cols.length}
          onChange={(e) => { const next = { ...cfg, rowTot: e.target.checked }; setCfg(next); reload(next); }} /> total column</label>
      <label className="row" title="Drop rows / columns that are entirely blank; totals are kept">
        <input type="checkbox" checked={cfg.hideEmpty} onChange={(e) => setCfg((c) => ({ ...c, hideEmpty: e.target.checked }))} /> hide empty</label>
      <label className="row" title="Decimals shown (of the percent when % is on)">
        decimals <input type="number" min={0} max={6} value={cfg.prec} style={{ width: "3rem" }}
          onChange={(e) => setCfg((c) => ({ ...c, prec: Math.max(0, Math.min(6, Number(e.target.value) || 0)) }))} /></label>
    </div>
  );

  return (
    <main className="lens" style={{ paddingRight: "1rem" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Pivot</h1>
          <p className="sub">Server-side pivot over the cube · the grid never groups or sums</p>
        </div>
        <div className="row">
          <button className={mode === "grid" ? "primary" : ""} onClick={() => setMode("grid")}>Grid</button>
          <button className={mode === "chart" ? "primary" : ""} onClick={() => setMode("chart")}>Chart</button>
          <button onClick={() => setShowRepo((s) => !s)}>{showRepo ? "Hide" : "Views"}</button>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="err small">the cube has no level for the context fields: {missing.join(", ")}</div>
      )}
      {warning && <div className="rag-amber small" style={{ margin: "0.3rem 0" }}>⚠ {warning}</div>}
      {error && <div className="err small">{error}</div>}

      <QueryState q={dimsQ}>
        {() => (
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", marginTop: "0.6rem" }}>
            <FieldList cfg={cfg} setCfg={setCfg} onApply={() => reload()} display={display} guard={guardLine} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {loading && <div className="spin">querying cube…</div>}
              {mode === "grid" ? (
                <PivotGrid flat={flat} colMembers={colMembers} measures={cfg.measures}
                  cfg={cfg} grand={grand} dollarMeasures={dollarMeasures} captions={captions}
                  onToggle={toggleExpand}
                  onSort={(sort) => setCfg((c) => ({ ...c, sort }))} />
              ) : (
                <Suspense fallback={<div className="spin">loading chart…</div>}>
                  <ChartMode cfg={cfg} model={model} rules={rules} savedQueries={chartView?.queries} savedChart={chartView?.chart} />
                </Suspense>
              )}
            </div>
            {showRepo && <Repository currentState={currentState} onLoad={loadViewState} />}
          </div>
        )}
      </QueryState>

      {/* description pane — what the loaded view captures (reading column, et-book serif) */}
      {loadedView && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid var(--line)", paddingTop: "0.7rem" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ margin: 0 }}>About this view · {loadedView.name}</h2>
            <button className="small" onClick={() => setLoadedView(null)} title="dismiss">×</button>
          </div>
          {loadedView.description
            ? <p className="reading" style={{ margin: "0.4rem 0 0" }}>{loadedView.description}</p>
            : <p className="muted small" style={{ margin: "0.4rem 0 0" }}>No description saved for this view.</p>}
        </div>
      )}
    </main>
  );
}
