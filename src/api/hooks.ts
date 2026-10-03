// TanStack Query hooks over risk_api.py. The 5-min staleTime mirrors the Streamlit
// @st.cache_data(ttl=300): GETs cache, dedupe, and refetch on context change. Query keys carry
// every parameter so a context-bar change (manager/date/scenario) refetches the right slice.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiGet, apiSend } from "./client";
import type { Meta, Dims, WhatIfResult } from "./types";

export interface Trade { position: string; weight: number }

const FIVE_MIN = 5 * 60 * 1000;
const common = { staleTime: FIVE_MIN, gcTime: FIVE_MIN, placeholderData: keepPreviousData };

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => apiGet<Meta>("/meta"), staleTime: Infinity });
}
export function useDims() {
  return useQuery({ queryKey: ["dims"], queryFn: () => apiGet<Dims>("/dims"), staleTime: Infinity });
}

// /whatif is POST: empty trades bootstraps the editor (holdings + universe + before figures);
// non-empty returns before/after/delta. Used by the Overview (gross/net/HHI) and the What-if lens.
export function useWhatif(date: string, manager: string, trades: Trade[]) {
  return useQuery({
    queryKey: ["whatif", date, manager, JSON.stringify(trades)],
    queryFn: () => apiSend<WhatIfResult>("POST", "/whatif", { date, manager, trades }),
    enabled: !!date,
    ...common,
  });
}
