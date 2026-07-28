/**
 * A jurisdiction is a country-level entry in the selector. Each maps to a
 * data-region id used by the scoring pipeline's API (api_weeks / api_cells /
 * api_segments / api_fires). A jurisdiction may be live before scoring covers
 * the whole country — `coverageBbox` marks the monitored area inside it.
 */
export type Jurisdiction = {
  id: string;
  label: string;
  /** Region id passed to the data API (e.g. "pt-centro"). */
  dataRegionId: string;
  /** [lon, lat] map center when this jurisdiction is selected. */
  center: [number, number];
  zoom: number;
  /**
   * Monitored-coverage bbox [minLon, minLat, maxLon, maxLat], drawn as a
   * dashed outline when scoring covers only part of the country.
   */
  coverageBbox?: [number, number, number, number];
};

export const JURISDICTIONS: Jurisdiction[] = [
  {
    id: "pt",
    label: "Portugal",
    dataRegionId: "portugal",
    center: [-8.0, 39.7],
    zoom: 6.4,
  },
  {
    id: "es",
    label: "Spain",
    dataRegionId: "spain",
    center: [-3.7, 40.2],
    zoom: 5.9,
  },
  {
    id: "fr",
    label: "France",
    dataRegionId: "france",
    center: [2.4, 46.6],
    zoom: 5.6,
  },
];

export const DEFAULT_JURISDICTION: Jurisdiction = JURISDICTIONS[0];
