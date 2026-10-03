// A pivot request becomes MDX text. Pure. Every name from the caller reaches the output through esc.
import { levelKey, parseLevelKey } from "./discovery";

export interface ApQuery {
  cube: string;
  rows: string[]; // level keys; several levels of one hierarchy: the LAST one given is the deepest
  cols: string[];
  measures: string[];
  filters: Record<string, string[]>; // level key -> member path strings (see pathKey)
  nonEmpty: boolean;
  slicing: string[]; // CubeModel.slicing
}

const SEP = "␞";

export const pathKey = (parts: string[]): string => parts.join(SEP);
export const splitPath = (s: string): string[] => s.split(SEP);

const esc = (s: string) => s.replace(/\]/g, "]]");

export const measureKey = (name: string): string => `[Measures].[${esc(name)}]`;

// Full-path member. A slicing level takes the short form: the ALL form is a 400 there.
export function memberKey(lvlKey: string, path: string, slicing: string[]): string {
  const parts = splitPath(path);
  if (slicing.includes(lvlKey)) {
    if (parts.length !== 1) throw new Error(`slicing member must be one name: ${lvlKey}`);
    return `${lvlKey}.[${esc(parts[0])}]`;
  }
  return `${lvlKey}.[ALL].[AllMember]${parts.map((p) => `.[${esc(p)}]`).join("")}`;
}

const hierKey = (lvlKey: string): string => {
  const r = parseLevelKey(lvlKey);
  return `[${esc(r.dim)}].[${esc(r.hier)}]`;
};

// Normalised key: the exact bracket form, escaped once, whatever spelling the caller used.
const norm = (k: string): string => levelKey(parseLevelKey(k));

// One set per hierarchy: the last level given for a hierarchy wins; hierarchies keep first-seen order.
function axisLevels(keys: string[]): string[] {
  const byHier = new Map<string, string>();
  for (const k of keys) byHier.set(hierKey(k), norm(k));
  return [...byHier.values()];
}

function crossJoin(sets: string[]): string {
  return sets.reduce((acc, s) => `CrossJoin(${acc}, ${s})`);
}

export function buildMdx(q: ApQuery): string {
  if (q.measures.length === 0) throw new Error("select at least one measure");
  const rows = axisLevels(q.rows);
  const cols = axisLevels(q.cols);
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
    const lk = norm(key);
    const mk = members.map((m) => memberKey(lk, m, q.slicing));
    if (mk.length === 1 && !onAxis.has(h)) where.push(mk[0]);
    else subs.push(`{${mk.join(", ")}}`);
  }

  let from = `[${esc(q.cube)}]`;
  for (const s of subs) from = `(SELECT ${s} ON COLUMNS FROM ${from})`;
  mdx += ` FROM ${from}`;
  if (where.length > 0) mdx += ` WHERE (${where.join(", ")})`;
  return mdx;
}
