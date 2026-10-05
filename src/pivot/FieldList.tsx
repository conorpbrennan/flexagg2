// The Excel field list (docs/vite-ui-plan.md §5): the cube's levels and visible measures (useCubeModel),
// clicked into four zones that map straight to the pivot query — ROWS→rows, COLUMNS→cols,
// VALUES→measures, FILTERS→filters. Field ids are level keys; filters store member paths. dnd-kit gives
// drag-reorder of the ROWS zone (order IS the drill hierarchy). The guards (src/ap/guards.ts) own the rules.
import { useMemo, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, horizontalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCubeModel, type CubeModel } from "../ap/discovery";
import { fetchMembers } from "../ap/pivotSource";
import { splitPath } from "../ap/mdx";
import type { PivotConfig } from "./usePivot";

type Member = { path: string; label: string };
const membersKey = (levelKey: string) => ["ap", "members", levelKey];

function Chip({ id, label, onRemove, sortable }: { id: string; label: string; onRemove: () => void; sortable?: boolean }) {
  const s = useSortable({ id, disabled: !sortable });
  const style = sortable
    ? { transform: CSS.Transform.toString(s.transform), transition: s.transition }
    : undefined;
  return (
    <span ref={sortable ? s.setNodeRef : undefined} style={style}
      className="tag" {...(sortable ? { ...s.attributes, ...s.listeners } : {})}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      >
      {sortable && <span style={{ cursor: "grab", color: "var(--faint)" }}>⠿ </span>}
      {label}
      <button onClick={onRemove} title="remove"
        style={{ border: "none", padding: "0 0 0 0.3rem", color: "var(--faint)" }}>×</button>
    </span>
  );
}

function Zone({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <div className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>{title}</div>
      <div className="wrap" style={{ minHeight: "1.5rem", gap: "0.3rem" }}>{children}</div>
    </div>
  );
}

// Dimensions -> hierarchies -> levels in depth order, as the model lists them (it lists levels shallow to deep).
function groupLevels(model: CubeModel) {
  const dims = new Map<string, Map<string, CubeModel["levels"]>>();
  for (const l of model.levels) {
    const hs = dims.get(l.dim) ?? new Map<string, CubeModel["levels"]>();
    hs.set(l.hier, [...(hs.get(l.hier) ?? []), l]);
    dims.set(l.dim, hs);
  }
  return [...dims.entries()].map(([dim, hs]) => ({
    dim,
    hiers: [...hs.entries()].map(([hier, levels]) => ({ hier, levels: [...levels].sort((a, b) => a.depth - b.depth) })),
  }));
}

// A guard result for the edited zones: a refusal (Apply will run nothing) or a notice (Apply will run with
// a default or a caveat).
export interface GuardLine { level: "refuse" | "notice"; text: string }

export function FieldList({
  cfg, setCfg, onApply, display, guard,
}: { cfg: PivotConfig; setCfg: (u: (c: PivotConfig) => PivotConfig) => void; onApply: () => void;
     display?: React.ReactNode; guard?: GuardLine | null }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [filterDim, setFilterDim] = useState<string>("");
  const [mq, setMq] = useState("");
  const model = useCubeModel().data;
  const qc = useQueryClient();

  // a level key's caption; a key the model lacks (an old saved view) is shown as its last bracket part
  const caption = (k: string) =>
    model?.levels.find((l) => l.key === k)?.caption ?? k.slice(k.lastIndexOf("[") + 1).replace(/\]+$/, "");
  const measureCaption = (m: string) => model?.measures.find((x) => x.name === m)?.caption ?? m;
  // a member path's caption: the cached label when the picker has loaded it, else the last path part
  const memberCaption = (k: string, path: string) =>
    qc.getQueryData<Member[]>(membersKey(k))?.find((m) => m.path === path)?.label ?? splitPath(path).slice(-1)[0];

  const addRow = (d: string) => setCfg((c) => (c.rows.includes(d) ? c : { ...c, rows: [...c.rows, d] }));
  const addCol = (d: string) => setCfg((c) => ({ ...c, cols: [d] }));
  const addMeasure = (m: string) => setCfg((c) => (c.measures.includes(m) ? c : { ...c, measures: [...c.measures, m] }));
  const remRow = (d: string) => setCfg((c) => ({ ...c, rows: c.rows.filter((x) => x !== d) }));
  const remCol = (d: string) => setCfg((c) => ({ ...c, cols: c.cols.filter((x) => x !== d) }));
  const remMeasure = (m: string) => setCfg((c) => ({ ...c, measures: c.measures.filter((x) => x !== m) }));
  const setFilter = (d: string, members: string[]) =>
    setCfg((c) => {
      const f = { ...c.filters };
      if (members.length) f[d] = members; else delete f[d];
      return { ...c, filters: f };
    });

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setCfg((c) => {
      const oldI = c.rows.indexOf(String(active.id));
      const newI = c.rows.indexOf(String(over.id));
      if (oldI < 0 || newI < 0) return c;
      return { ...c, rows: arrayMove(c.rows, oldI, newI) };
    });
  };

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 2,
      padding: "0.7rem", width: "17rem", flexShrink: 0 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <b style={{ fontSize: 13 }}>Fields</b>
        <button className="primary" onClick={onApply}>Apply</button>
      </div>
      {guard && (
        <div data-testid="guard-preview" className={`${guard.level === "refuse" ? "err" : "rag-amber"} small`}
          style={{ marginBottom: "0.5rem" }}>{guard.text}</div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <Zone title="Rows (drag to reorder = drill order)">
          <SortableContext items={cfg.rows} strategy={horizontalListSortingStrategy}>
            {cfg.rows.map((d) => <Chip key={d} id={d} label={caption(d)} onRemove={() => remRow(d)} sortable />)}
          </SortableContext>
        </Zone>
      </DndContext>

      <Zone title="Columns (≤1)">
        {cfg.cols.map((d) => <Chip key={d} id={d} label={caption(d)} onRemove={() => remCol(d)} />)}
      </Zone>
      <Zone title="Values">
        {cfg.measures.map((m) => <Chip key={m} id={m} label={measureCaption(m)} onRemove={() => remMeasure(m)} />)}
      </Zone>
      <Zone title="Filters">
        {Object.entries(cfg.filters).map(([d, v]) => (
          <Chip key={d} id={d} onRemove={() => setFilter(d, [])}
            label={v.length === 0 ? caption(d) : `${caption(d)}=${v.length > 1 ? `${v.length}` : memberCaption(d, v[0])}`} />
        ))}
      </Zone>
      {display && <Zone title="Display">{display}</Zone>}

      <hr className="rule" style={{ margin: "0.6rem 0" }} />

      <div style={{ maxHeight: "12rem", overflowY: "auto" }}>
        <div className="muted small" style={{ marginBottom: "0.2rem" }}>Dimensions</div>
        {model && groupLevels(model).map(({ dim, hiers }) => (
          <div key={dim}>
            <div className="muted" style={{ fontSize: 10.5, marginTop: "0.25rem" }}>{dim}</div>
            {hiers.map(({ hier, levels }) => (
              <div key={hier}>
                {hier !== dim && <div className="muted" style={{ fontSize: 10.5, paddingLeft: "0.4rem" }}>{hier}</div>}
                {levels.map((l) => {
                  // reflect the CURRENT view: R/C/F light up for the axis this level sits on; clicking toggles.
                  const d = l.key;
                  const inRows = cfg.rows.includes(d);
                  const inCols = cfg.cols.includes(d);
                  const inFilters = d in cfg.filters;
                  const active = inRows || inCols || inFilters;
                  return (
                    <div key={d} data-testid={`level-${l.level}`} className={`fieldrow${active ? " active" : ""}`}
                      style={{ paddingLeft: "0.8rem" }}>
                      <span>{l.caption}</span>
                      <span className="row" style={{ gap: "0.15rem" }}>
                        <button className={`fieldbtn${inRows ? " on" : ""}`} title={inRows ? "remove from rows" : "to rows"}
                          onClick={() => (inRows ? remRow(d) : addRow(d))}>R</button>
                        <button className={`fieldbtn${inCols ? " on" : ""}`} title={inCols ? "remove from columns" : "to columns"}
                          onClick={() => (inCols ? remCol(d) : addCol(d))}>C</button>
                        <button className={`fieldbtn${inFilters ? " on" : ""}`} title={inFilters ? "clear filter" : "filter"}
                          onClick={() => (inFilters ? setFilter(d, []) : setFilterDim(d))}>F</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      {filterDim && model && (
        <FilterPicker key={filterDim} model={model} levelKey={filterDim} title={caption(filterDim)}
          selected={cfg.filters[filterDim] ?? []}
          onClose={() => setFilterDim("")}
          onChange={(ms) => setFilter(filterDim, ms)} />
      )}

      <div className="muted small" style={{ margin: "0.5rem 0 0.2rem" }}>Measures</div>
      <input value={mq} onChange={(e) => setMq(e.target.value)} placeholder="filter measures"
        style={{ width: "100%", boxSizing: "border-box", marginBottom: "0.2rem" }} />
      <div data-testid="measures" style={{ maxHeight: "12rem", overflowY: "auto" }}>
        {(model?.measures ?? []).filter((m) => m.visible && m.caption.toLowerCase().includes(mq.trim().toLowerCase()))
          .sort((a, b) => a.caption.localeCompare(b.caption)).map((mi) => {
          const m = mi.name;
          const inVals = cfg.measures.includes(m);   // selected measures are highlighted; +/− toggles
          return (
            <div key={m} data-testid="measure" className={`fieldrow${inVals ? " active" : ""}`}>
              <span>{mi.caption}</span>
              <button className={`fieldbtn${inVals ? " on" : ""}`} title={inVals ? "remove from values" : "to values"}
                onClick={() => (inVals ? remMeasure(m) : addMeasure(m))}>{inVals ? "−" : "+"}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Rows the picker renders at once. Position and Issuer have ~5,000 members; rendering them all is slow and
// unreadable, so the list shows the first matches and the search narrows the rest.
const MEMBER_CAP = 200;

function FilterPicker({
  model, levelKey, title, selected, onChange, onClose,
}: { model: CubeModel; levelKey: string; title: string; selected: string[]; onChange: (m: string[]) => void;
     onClose: () => void }) {
  // members are cached per level; a filter stores the full path, the box shows the caption
  const mq = useQuery({
    queryKey: membersKey(levelKey), queryFn: () => fetchMembers(model, levelKey), staleTime: Infinity,
  });
  const [sel, setSel] = useState<string[]>(selected);
  const [q, setQ] = useState("");
  const toggle = (m: string) => setSel((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  // ticks live in `sel`, not in the visible rows, so they survive a new search
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = mq.data ?? [];
    return needle ? all.filter((m) => m.label.toLowerCase().includes(needle)) : all;
  }, [mq.data, q]);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 2, padding: "0.5rem", margin: "0.4rem 0",
      background: "var(--bg)" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.3rem" }}>
        <b className="small">Filter {title}</b>
        <span className="row" style={{ gap: "0.4rem" }}>
          {sel.length > 0 && <span className="muted small">{sel.length} selected</span>}
          <button onClick={() => { onChange(sel); onClose(); }}>done</button>
        </span>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search members" autoFocus
        style={{ width: "100%", boxSizing: "border-box", marginBottom: "0.2rem" }} />
      <div style={{ maxHeight: "10rem", overflowY: "auto" }}>
        {mq.isLoading && <div className="muted small">loading members…</div>}
        {mq.isError && <div className="err small">{(mq.error as Error).message}</div>}
        {mq.isSuccess && matches.length === 0 && <div className="muted small">no member matches</div>}
        {matches.slice(0, MEMBER_CAP).map((m) => (
          <label key={m.path} className="row small" style={{ gap: "0.3rem" }}>
            <input type="checkbox" checked={sel.includes(m.path)} onChange={() => toggle(m.path)} /> {m.label}
          </label>
        ))}
      </div>
      {matches.length > MEMBER_CAP && (
        <div className="muted small">{MEMBER_CAP} of {matches.length.toLocaleString("en-US")} shown; refine the search</div>
      )}
    </div>
  );
}
