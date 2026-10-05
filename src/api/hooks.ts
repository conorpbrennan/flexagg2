// TanStack Query hooks over risk_api.py. /meta and /dims are static between cube rebuilds, so they
// load once (staleTime: Infinity) and feed the context bar and the guards.
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./client";
import type { Meta, Dims } from "./types";

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => apiGet<Meta>("/meta"), staleTime: Infinity });
}
export function useDims() {
  return useQuery({ queryKey: ["dims"], queryFn: () => apiGet<Dims>("/dims"), staleTime: Infinity });
}
