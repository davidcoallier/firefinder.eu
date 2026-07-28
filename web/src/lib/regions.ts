export type Region = {
  id: string;
  name: string;
  /** [lon, lat] */
  center: [number, number];
  zoom: number;
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
};

export const REGIONS: Region[] = [
  {
    id: "pt-centro",
    name: "Central Portugal",
    center: [-7.9, 40.0],
    zoom: 8,
    bbox: [-8.8, 39.0, -7.0, 41.0],
  },
];

export const DEFAULT_REGION: Region = REGIONS[0];
