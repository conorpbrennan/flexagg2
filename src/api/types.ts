// Response shapes for risk_api.py. These mirror the JSON the endpoints emit (see CLAUDE.md and
// the docstrings in risk_api.py). Records are loosely typed (tidy dicts keyed by dim/measure name)
// because /pivot is generic; the typed fields are the structured endpoints.

export type Rec = Record<string, string | number | null>;

// One manager, as served by /meta's `managers` array (multi-manager Phase 3/4). On today's
// single-manager data this is exactly one entry with every entity field null — the UI must degrade
// silently on null, never assume the attributes are populated.
export interface Manager {
  manager: string;
  entity_name: string | null;
  firm_type: string | null;
  cik: string | number | null;
  n_positions_distinct: number | null;
}

export interface Meta {
  dates: string[];
  scenario_sets: string[];
  factors: string[];
  ts_measures: string[];
  by_levels: string[];
  hypo_shocks?: Record<string, Record<string, number>>;
  managers?: Manager[];
}

// The shape a single-manager-artifact endpoint (/universe, /funnel, /span, /drift,
// /pnl_attribution*) returns INSTEAD of its normal payload when the requested manager isn't
// verifiably the one the precomputed artifact covers (risk_api.py's `_manager_guard`, mirroring the
// pre-existing /drawdown `status: "insufficient"` idiom — HTTP 200, never a crash or empty chart).
// Field names are pinned exactly to `_manager_guard`'s return dict.
export interface ManagerMismatch {
  status: "manager_mismatch";
  kind: string;
  requested_manager: string;
  artifact_manager: string | null;
  basis: string;
  reason: string;
}

export interface Dims {
  dimensions: string[];
  measures: string[];
  scenario_dependent: string[];
  day_dependent?: string[];   // the Day-path measures (PnL at day & co.) — need a DaySet context
  price_dependent?: string[];
  dollar_measures?: string[];
  members: Record<string, string[]>;
  dates: string[];
  scenario_sets: string[];
}

export interface PivotResult {
  rows: string[];
  cols: string[];
  measures: string[];
  totals: boolean;
  warning: string | null;
  records: Rec[];
  per_row?: Rec[];
  per_col?: Rec[];
  grand?: Record<string, number | null>;
  units?: "weight" | "dollar";       // /pivot?units=dollar priced the weight-unit measures in $
  dollar_measures?: string[];        // ...and these are the ones it converted
}

export interface WhatIfRisk {
  model_vol_1d: number;               // the reference risk number (σ = √(x'Fx + w'Δw))
  scenario_var_99: number; scenario_var_975: number;
  es_975: number; es_99: number; specific_vol: number;
  total_var_99: number; top5_ctr_share: number | null; gross: number; net: number;
}
export interface WhatIfResult {
  date: string; manager: string;
  trades: { position: string; ticker: string; old: number; new: number }[];
  before: WhatIfRisk; after: WhatIfRisk; delta: Partial<WhatIfRisk>;
  holdings: { position: string; ticker: string; weight: number }[];
  universe: { position: string; ticker: string }[];
  unpriced?: { position: string; ticker: string; weight: number }[]; // held, no loadings this date
  priced_weight?: number;
  source?: string;                    // "cube" (scenario branch) | "numpy_fallback"
  verification?: { max_abs_diff_vols: number; max_rel_diff_tails: number } | { error: string };
}

// ---- saved views (views_api.py) ----
export interface ViewLeaf {
  name: string; slug: string; path: string; file: string;
  created?: string; updated?: string;
}
export interface ViewTree { folders: Record<string, ViewTree>; views: ViewLeaf[] }
export interface ViewDoc {
  schema_version: 2; name: string; path: string;   // the store emits 2; anything else is refused on load
  created: string; updated: string; state: ViewState;
}
export interface PivotQuery {
  name: string; rows: string[]; cols: string[]; measures: string[];
  filters?: Record<string, string[]>;
}
// AG Grid column-state sort entry, the shape the Streamlit grid saves (colId = measure name, or
// "<col member> / <measure>" with a column dim, or a row dim name for the label column).
export interface SortItem { colId: string; sort: "asc" | "desc"; sortIndex?: number }
export interface ViewState {
  rows: string[]; cols: string[]; measures: string[];
  slice_dims?: string[]; filters?: Record<string, string[]>;
  row_tot?: boolean; col_tot?: boolean; as_pct?: boolean; hide_empty?: boolean;
  heat?: boolean; prec?: number; sort?: SortItem[];
  units?: "weight" | "dollar";   // dollar = every weight-unit measure × Manager MV (2026-08-22)
  date_fmt?: string; render?: "grid" | "chart";
  // `chart` is a COMPLETE Vega-Lite spec, or a LIST of them (one per graph); each carries a `source`
  // naming the query in `queries` whose records feed it. Rendered verbatim (charts are not rebuilt).
  queries?: PivotQuery[]; chart?: VegaSpec | VegaSpec[] | null;
  description?: string;   // human note: what the view captures (shown in the Pivot description pane)
}
export type VegaSpec = Record<string, unknown>;
