// Persistent left rail of lenses. Overview is the monitor; everything else is a lens reached on
// demand (docs/vite-ui-plan.md layout). The active route keeps the accent marker.
import { NavLink } from "react-router-dom";

const LENSES: { to: string; label: string }[] = [
  { to: "/pivot", label: "Pivot" },
];

export function LeftRail() {
  return (
    <nav className="rail">
      {LENSES.map((l) => (
        <NavLink key={l.to} to={l.to} end={l.to === "/"}
          className={({ isActive }) => (isActive ? "active" : "")}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
