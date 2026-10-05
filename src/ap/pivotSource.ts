// One pivot level fetch: guards, then MDX, then the adapter. The only caller of apMdx outside discovery.
import type { PivotResult } from "../api/types";
import { ApError, apMdx, type RawCellSet } from "./client";
import { cellsetToRecords, labelKey, toPivotResult } from "./cellset";
import type { CubeModel } from "./discovery";
import { checkQuery, type Bindings, type GuardRules } from "./guards";
import { buildMdx, type ApQuery } from "./mdx";

const MEMBER_COUNT = "contributors.COUNT";

export interface PivotArgs {
  cube: string;
  rows: string[];
  cols: string[];
  measures: string[];
  filters: Record<string, string[]>;
  totals: boolean; // the Total row: per_col (when there is a col dim) and grand
  rowTot: boolean; // the Total column: per_row (needs a col dim)
  slicing: string[]; // CubeModel.slicing
  depth: Record<string, number>; // level key -> depth, for every key in rows/cols
}

// The model-derived part of the args, so no caller spells cube, slicing or depth itself. A key the model
// does not know gets no depth entry; buildMdx then refuses it by name.
export function makeArgs(
  model: CubeModel,
  a: { rows: string[]; cols: string[]; measures: string[]; filters: Record<string, string[]>; totals: boolean; rowTot: boolean },
): PivotArgs {
  const depth: Record<string, number> = {};
  for (const k of [...a.rows, ...a.cols]) {
    const l = model.levels.find((x) => x.key === k);
    if (l) depth[k] = l.depth;
  }
  return { ...a, cube: model.cube, slicing: model.slicing, depth };
}

// The members of one level, each as its full path (what a filter stores) and its caption. One MDX call; the
// measure only makes NON EMPTY keep members that have positions. A level the model lacks throws `no depth`.
export async function fetchMembers(
  model: CubeModel,
  levelKey: string,
  signal?: AbortSignal,
): Promise<{ path: string; label: string }[]> {
  const a = makeArgs(model, { rows: [levelKey], cols: [], measures: [MEMBER_COUNT], filters: {}, totals: false, rowTot: false });
  const q: ApQuery = {
    cube: a.cube, rows: a.rows, cols: [], measures: a.measures, filters: {}, nonEmpty: true,
    slicing: a.slicing, depth: a.depth,
  };
  const recs = cellsetToRecords(await apMdx(buildMdx(q), { signal }), q);
  return recs.map((r) => ({ path: String(r[levelKey]), label: String(r[labelKey(levelKey)]) }));
}

// The query a pivot level sends, before the guards. Shared with the live guard preview (usePivot's
// guardPreview), so the preview checks exactly what Apply will.
export function toApQuery(args: PivotArgs): ApQuery {
  return {
    cube: args.cube,
    rows: args.rows,
    cols: args.cols,
    measures: args.measures,
    filters: args.filters,
    nonEmpty: true,
    slicing: args.slicing,
    depth: args.depth,
  };
}

export async function fetchPivotLevel(
  args: PivotArgs,
  rules: GuardRules,
  bind: Bindings,
  signal?: AbortSignal,
): Promise<PivotResult> {
  const checked = checkQuery(toApQuery(args), rules, bind);
  if (!checked.ok) throw new ApError(400, checked.error);
  const q = checked.q; // may carry the added Date filter; every margin query below shares it

  const run = (qq: ApQuery): Promise<RawCellSet> => apMdx(buildMdx(qq), { signal });
  // Margins are cube-computed, one query each. With no col dim per_col is the grand and per_row the body,
  // so those are not asked twice.
  const hasCols = q.cols.length > 0;
  const wantPerRow = args.rowTot && hasCols;
  const wantPerCol = args.totals && hasCols;
  const [body, perRow, perCol, grand] = await Promise.all([
    run(q),
    wantPerRow ? run({ ...q, cols: [] }) : undefined,
    wantPerCol ? run({ ...q, rows: [] }) : undefined,
    args.totals ? run({ ...q, rows: [], cols: [] }) : undefined,
  ]);

  const res = toPivotResult({ body, perRow, perCol, grand }, q);
  res.warning = checked.notice;
  if (q.filters[bind.units]?.length === 1 && q.filters[bind.units][0] === "$") {
    res.units = "dollar";
    res.dollar_measures = q.measures.filter((m) => rules.dollarMeasures.includes(m));
  }
  return res;
}
