// The lens routes, declared once. Dependency-free on purpose: App.tsx (route table, redirect
// target), context/AppContext.tsx (URL-sync gate) and shell/LeftRail.tsx (nav links) all import it,
// and App.tsx and AppContext.tsx cannot import each other without a cycle. Add a new lens path here
// and all three pick it up; LeftRail's LENS_LABELS will not compile until the path has a label.
export const LENS_PATHS = ["/pivot"] as const;
export type LensPath = (typeof LENS_PATHS)[number];
export const DEFAULT_LENS: LensPath = LENS_PATHS[0];
