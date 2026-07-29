import { supabase } from "./supabase";
import type { Cell, Drivers, FireCollection, SegmentCollection } from "./types";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

/** Weeks with published scores, newest first ('YYYY-MM-DD'). May be empty. */
export async function fetchWeeks(region: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("api_weeks", { p_region: region });
  if (error) throw new Error(`api_weeks failed: ${error.message}`);
  return (data ?? []) as string[];
}

const CELLS_PAGE = 25000;

/** Cells arrive in pages ordered by risk descending; `onPage` fires after each
 * page so the map can paint worst-first while the rest streams in. */
export async function fetchCells(
  region: string,
  week: string,
  onPage?: (cellsSoFar: Cell[]) => void
): Promise<Cell[]> {
  const all: Cell[] = [];
  for (let offset = 0; ; offset += CELLS_PAGE) {
    const { data, error } = await supabase.rpc("api_cells", {
      p_region: region,
      p_week: week,
      p_limit: CELLS_PAGE,
      p_offset: offset,
    });
    if (error) throw new Error(`api_cells failed: ${error.message}`);
    const page = (data ?? []) as Cell[];
    all.push(...page);
    if (page.length > 0 && page.length === CELLS_PAGE) onPage?.([...all]);
    if (page.length < CELLS_PAGE) break;
  }
  return all;
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
