// The cube's shape (levels, measures, slicing) as a typed model built from discovery. levelKey is the
// only place the "[d].[h].[l]" bracket form is built; parseLevelKey is its exact inverse.
import { useQuery } from "@tanstack/react-query";
import { apDiscovery, type RawDiscovery } from "./client";

export interface LevelRef {
  dim: string;
  hier: string;
  level: string;
}

export type LevelInfo = LevelRef & { key: string; caption: string; depth: number; slicing: boolean };

export interface MeasureInfo {
  name: string;
  caption: string;
  formatString: string;
  visible: boolean;
}

export interface CubeModel {
  cube: string;
  levels: LevelInfo[];
  measures: MeasureInfo[];
  slicing: string[];
}

const esc = (s: string) => s.replace(/\]/g, "]]");

export function levelKey(r: LevelRef): string {
  return `[${esc(r.dim)}].[${esc(r.hier)}].[${esc(r.level)}]`;
}

// Reads one "[...]" part starting at i; "]]" inside is a literal "]". Returns the text and the index after.
function readPart(key: string, i: number): [string, number] {
  if (key[i] !== "[") throw new Error(`bad level key: ${key}`);
  let out = "";
  for (let j = i + 1; j < key.length; j++) {
    if (key[j] === "]") {
      if (key[j + 1] === "]") {
        out += "]";
        j++;
      } else {
        return [out, j + 1];
      }
    } else {
      out += key[j];
    }
  }
  throw new Error(`bad level key: ${key}`);
}

export function parseLevelKey(key: string): LevelRef {
  const [dim, i1] = readPart(key, 0);
  if (key[i1] !== ".") throw new Error(`bad level key: ${key}`);
  const [hier, i2] = readPart(key, i1 + 1);
  if (key[i2] !== ".") throw new Error(`bad level key: ${key}`);
  const [level, i3] = readPart(key, i2 + 1);
  if (i3 !== key.length) throw new Error(`bad level key: ${key}`);
  return { dim, hier, level };
}

export function toCubeModel(raw: RawDiscovery, cube = "Exposures"): CubeModel {
  const c = raw.catalogs.flatMap((cat) => cat.cubes).find((x) => x.name === cube);
  if (!c) throw new Error(`cube ${cube} not in discovery`);
  const levels: LevelInfo[] = [];
  const slicing: string[] = [];
  for (const d of c.dimensions) {
    if (d.name === "Epoch") continue;
    for (const h of d.hierarchies) {
      let depth = 0;
      for (const l of h.levels) {
        if (l.type === "ALL") continue;
        depth += 1;
        const ref = { dim: d.name, hier: h.name, level: l.name };
        const key = levelKey(ref);
        levels.push({ ...ref, key, caption: l.caption, depth, slicing: h.slicing });
        if (h.slicing) slicing.push(key);
      }
    }
  }
  const measures = c.measures.map((m) => ({
    name: m.name,
    caption: m.caption,
    formatString: m.formatString ?? "",
    visible: m.visible,
  }));
  return { cube: c.name, levels, measures, slicing };
}

export function useCubeModel() {
  return useQuery({
    queryKey: ["ap", "discovery"],
    queryFn: async () => toCubeModel(await apDiscovery()),
    staleTime: Infinity,
  });
}
