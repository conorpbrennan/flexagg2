// The lens routes, declared once. Dependency-free on purpose: App.tsx (route table, redirect
// target) and context/AppContext.tsx (URL-sync gate) both import it, and neither can import the
// other without a cycle. Add a new lens path here and both pick it up.
export const LENS_PATHS = ["/pivot"] as const;
export type LensPath = (typeof LENS_PATHS)[number];
export const DEFAULT_LENS: LensPath = LENS_PATHS[0];
