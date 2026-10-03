// The only place the four context-bar level keys are written, and the fold from AppContext's context
// into level-key filters. Pure.
import type { Bindings } from "./guards";
import type { CubeModel } from "./discovery";

export const BINDINGS: Bindings = {
  manager: "[Positions].[Manager].[Manager]",
  date: "[Exposures].[Date].[Date]",
  scenarioSet: "[Scenarios].[ScenarioSet].[ScenarioSet]",
  units: "[Units].[Units].[Units]",
};

export const DEFAULT_ROWS = ["[FactorMeta].[FactorDim].[FactorGroup]"];

// The binding names whose level the model does not have.
export function checkBindings(model: CubeModel): string[] {
  const have = new Set(model.levels.map((l) => l.key));
  return (Object.keys(BINDINGS) as (keyof Bindings)[]).filter((k) => !have.has(BINDINGS[k]));
}

// Each value is a one-part member path; an empty value adds nothing.
export function contextFilters(ctx: { manager: string; date: string; scenario: string }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (ctx.manager) out[BINDINGS.manager] = [ctx.manager];
  if (ctx.date) out[BINDINGS.date] = [ctx.date];
  if (ctx.scenario) out[BINDINGS.scenarioSet] = [ctx.scenario];
  return out;
}
