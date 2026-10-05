// The only module that talks to ActivePivot. In dev, vite.config proxies AP_BASE to :9095 with the
// prefix stripped; nothing else in the app may fetch ActivePivot.
export const AP_BASE = "/ap";
const REST_ROOT = `${AP_BASE}/activeviam/pivot/rest/v9`;

export class ApError extends Error {
  status: number;
  chain: string[];
  constructor(status: number, message: string, chain: string[] = [message]) {
    super(message);
    this.status = status;
    this.chain = chain;
    this.name = "ApError";
  }
}

// Exactly the discovery fields toCubeModel reads, as the live response spells them. Level `type` is
// "ALL" for the synthetic top level; `formatString` is absent on some measures.
export interface RawLevel {
  name: string;
  caption: string;
  type: string;
}
export interface RawHierarchy {
  name: string;
  slicing: boolean;
  levels: RawLevel[];
}
export interface RawDimension {
  name: string;
  hierarchies: RawHierarchy[];
}
export interface RawMeasure {
  name: string;
  caption: string;
  formatString?: string;
  visible: boolean;
}
export interface RawCube {
  name: string;
  dimensions: RawDimension[];
  measures: RawMeasure[];
}
export interface RawDiscovery {
  catalogs: { name: string; cubes: RawCube[] }[];
}

export interface RawPosition {
  namePath: string[];
  captionPath: string[];
}

export interface RawAxis {
  id: number; // 0 columns, 1 rows, -1 slicer
  hierarchies: unknown[];
  positions: RawPosition[][];
}

export interface RawCell {
  ordinal: number;
  value: unknown;
  formattedValue: string;
}

export interface RawCellSet {
  axes: RawAxis[];
  cells: RawCell[];
}

// "[400] com.x.MdxException: Unknown member: [A].[B]" -> "Unknown member: [A].[B]". Strips only the [NNN]
// code and a leading Java class (dotted name ending in Exception/Error); other colons are content. Never "".
// Repeatable: cause chains stack prefixes ("a.XException: b.YException: msg"). The simple name may be
// exactly "Exception" or "Error" (java.lang.Exception, java.lang.Error).
const JAVA_CLASS_PREFIX = /^(?:(?:[A-Za-z_$][\w$]*\.)+(?:[A-Za-z_$][\w$]*)?(?:Exception|Error):\s+)+/;
function trimMessage(raw: string): string {
  const noCode = raw.replace(/^\[\d+\]\s*/, "");
  const tail = noCode.replace(JAVA_CLASS_PREFIX, "").trim();
  return tail || noCode.trim() || raw.trim();
}

async function toError(res: Response): Promise<ApError> {
  const fallback = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    const raw: unknown[] = Array.isArray(body?.errorChain) ? body.errorChain : [];
    const chain = raw
      .map((e) => (e && typeof (e as { message?: unknown }).message === "string" ? trimMessage((e as { message: string }).message) : ""))
      .filter((m) => m !== "");
    if (chain.length === 0) return new ApError(res.status, fallback);
    return new ApError(res.status, chain[0], chain);
  } catch {
    return new ApError(res.status, fallback);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // A rejected fetch (including AbortError) propagates through the returned promise; the caller owns it.
  const res = await fetch(`${REST_ROOT}${path}`, init);
  if (!res.ok) throw await toError(res);
  const body = await res.json();
  return (body && typeof body === "object" && "data" in body ? body.data : body) as T;
}

export function apDiscovery(): Promise<RawDiscovery> {
  return request<RawDiscovery>("/cube/discovery");
}

export function apMdx(
  mdx: string,
  opts?: { timeLimitS?: number; signal?: AbortSignal },
): Promise<RawCellSet> {
  return request<RawCellSet>("/cube/query/mdx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mdx, context: { queriesTimeLimit: String(opts?.timeLimitS ?? 30) } }),
    signal: opts?.signal,
  });
}
