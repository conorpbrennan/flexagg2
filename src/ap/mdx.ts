// A pivot request becomes MDX text. Pure. Every name from the caller reaches the output through esc.
import { esc, levelKey, parseLevelKey } from "./discovery";

export interface ApQuery {
  cube: string;
  rows: string[]; // level keys; of several levels of one hierarchy the deepest (by depth) is used
  cols: string[];
  measures: string[];
  filters: Record<string, string[]>; // level key -> member path strings (see pathKey)
  nonEmpty: boolean;
  slicing: string[]; // CubeModel.slicing
  depth: Record<string, number>; // level key -> LevelInfo.depth, for every key in rows/cols
}

const SEP = "␞";

export const pathKey = (parts: string[]): string => parts.join(SEP);
export const splitPath = (s: string): string[] => s.split(SEP);

export const measureKey = (name: string): string => `[Measures].[${esc(name)}]`;

// Full-path member. A slicing level takes the short form: the ALL form is a 400 there.
export function memberKey(lvlKey: string, path: string, slicing: string[]): string {
  const lk = levelKey(parseLevelKey(lvlKey));
  const parts = splitPath(path);
  if (parts.some((p) => p === "")) throw new Error("empty member name");
  if (slicing.includes(lk)) {
    if (parts.length !== 1) throw new Error(`slicing member must be one name: ${lk}`);
    return `${lk}.[${esc(parts[0])}]`;
  }
  return `${lk}.[ALL].[AllMember]${parts.map((p) => `.[${esc(p)}]`).join("")}`;
}

const hierKey = (lvlKey: string): string => {
  const r = parseLevelKey(lvlKey);
  return `[${esc(r.dim)}].[${esc(r.hier)}]`;
};

// One set per hierarchy: the level with the greatest depth wins, whatever the order given; hierarchies keep
// first-seen order.
function axisLevels(keys: string[], depth: Record<string, number>): string[] {
  const byHier = new Map<string, { key: string; depth: number }>();
  for (const k of keys) {
    const d = depth[k];
    if (d === undefined) throw new Error(`no depth for ${k}`);
    const h = hierKey(k);
    const cur = byHier.get(h);
    if (!cur || d > cur.depth) byHier.set(h, { key: levelKey(parseLevelKey(k)), depth: d });
  }
  return [...byHier.values()].map((v) => v.key);
}

function crossJoin(sets: string[]): string {
  return sets.reduce((acc, s) => `CrossJoin(${acc}, ${s})`);
}

export function buildMdx(q: ApQuery): string {
  if (q.measures.length === 0) throw new Error("select at least one measure");
  const rows = axisLevels(q.rows, q.depth);
  const cols = axisLevels(q.cols, q.depth);
  const rowHiers = new Set(rows.map(hierKey));
  for (const c of cols) {
    if (rowHiers.has(hierKey(c))) throw new Error(`hierarchy on two axes: ${hierKey(c)}`);
  }
  const onAxis = new Set([...rows, ...cols].map(hierKey));

  const colSets = [`{${q.measures.map(measureKey).join(", ")}}`, ...cols.map((l) => `${l}.Members`)];
  const ne = q.nonEmpty ? "NON EMPTY " : "";
  let mdx = `SELECT ${ne}${crossJoin(colSets)} ON COLUMNS`;
  if (rows.length > 0) mdx += `, ${ne}${crossJoin(rows.map((l) => `${l}.Members`))} ON ROWS`;

  const where: string[] = [];
  const subs: string[] = [];
  const seen = new Set<string>();
  for (const [key, members] of Object.entries(q.filters)) {
    if (members.length === 0) continue;
    const h = hierKey(key);
    if (seen.has(h)) throw new Error(`two filters on one hierarchy: ${h}`);
    seen.add(h);
    const mk = members.map((m) => memberKey(key, m, q.slicing));
    if (mk.length === 1 && !onAxis.has(h)) where.push(mk[0]);
    else subs.push(`{${mk.join(", ")}}`);
  }

  let from = `[${esc(q.cube)}]`;
  for (const s of subs) from = `(SELECT ${s} ON COLUMNS FROM ${from})`;
  mdx += ` FROM ${from}`;
  if (where.length > 0) mdx += ` WHERE (${where.join(", ")})`;
  return mdx;
}
