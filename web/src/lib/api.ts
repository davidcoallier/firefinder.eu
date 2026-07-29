import { supabase } from "./supabase";
import type { Cell, Drivers, FireCollection, SegmentCollection } from "./types";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

/** Weeks with published scores, newest first ('YYYY-MM-DD'). May be empty. */
export async function fetchWeeks(region: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("api_weeks", { p_region: region });
  if (error) throw new Error(`api_weeks failed: ${error.message}`);
  return (data ?? []) as string[];
}

export async function fetchCells(region: string, week: string): Promise<Cell[]> {
  const { data, error } = await supabase.rpc("api_cells", {
    p_region: region,
    p_week: week,
  });
  if (error) throw new Error(`api_cells failed: ${error.message}`);
  return (data ?? []) as Cell[];
}

/** Per-cell SHAP drivers, fetched on demand when a cell is selected (the bulk
 * cells payload ships without them for size). */
export async function fetchCellDrivers(h3: string, week: string): Promise<Drivers> {
  const { data, error } = await supabase.rpc("api_cell_drivers", {
    p_h3: h3,
    p_week: week,
  });
  if (error) throw new Error(`api_cell_drivers failed: ${error.message}`);
  return (data ?? {}) as Drivers;
}

export async function fetchSegments(
  region: string,
  week: string
): Promise<SegmentCollection> {
  const { data, error } = await supabase.rpc("api_segments", {
    p_region: region,
    p_week: week,
  });
  if (error) throw new Error(`api_segments failed: ${error.message}`);
  return (data ?? EMPTY_FC) as SegmentCollection;
}

export async function fetchFires(region: string): Promise<FireCollection> {
  const { data, error } = await supabase.rpc("api_fires", { p_region: region });
  if (error) throw new Error(`api_fires failed: ${error.message}`);
  return (data ?? EMPTY_FC) as FireCollection;
}
