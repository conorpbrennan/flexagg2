// Persistent left rail of lenses. Overview is the monitor; everything else is a lens reached on
// demand (docs/vite-ui-plan.md layout). The active route keeps the accent marker.
import { NavLink } from "react-router-dom";
import { LENS_PATHS, type LensPath } from "../routes/paths";

// One label per lens path: a path added to LENS_PATHS without a label here is a type error.
export const LENS_LABELS: Record<LensPath, string> = {
  "/pivot": "Pivot",
};

export function LeftRail() {
  return (
    <nav className="rail">
      {LENS_PATHS.map((p) => (
        <NavLink key={p} to={p} className={({ isActive }) => (isActive ? "active" : "")}>
          {LENS_LABELS[p]}
        </NavLink>
      ))}
    </nav>
  );
}
