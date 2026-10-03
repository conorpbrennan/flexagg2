import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { ContextBar } from "./shell/ContextBar";
import { LeftRail } from "./shell/LeftRail";
// The pivot pulls AG Grid (+ Vega in chart mode) — code-split so the monitor loads light.
const Pivot = lazy(() => import("./routes/Pivot").then((m) => ({ default: m.Pivot })));

export default function App() {
  return (
    <AppProvider>
      <div className="app">
        <ContextBar />
        <div className="body">
          <LeftRail />
          <Suspense fallback={<main className="lens"><div className="spin">loading…</div></main>}>
          <Routes>
            <Route path="/" element={<Navigate to="/pivot" replace />} />
            <Route path="/pivot" element={<Pivot />} />
            <Route path="*" element={<Navigate to="/pivot" replace />} />
          </Routes>
          </Suspense>
        </div>
      </div>
    </AppProvider>
  );
}
