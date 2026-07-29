/** Signed driver attributions keyed by feature name (SHAP-style contributions). */
export type Drivers = Record<string, number>;

export interface Cell {
  h3: string;
  /** Ignition probability, 0-1. */
  p: number;
  drivers?: Drivers | null;
}

/** Minimal GeoJSON typings for what the API returns. */
export interface Geometry {
  type: string;
  coordinates: unknown;
}

export interface Feature<P> {
  type: "Feature";
  geometry: Geometry;
  properties: P;
}

export interface FeatureCollection<P> {
  type: "FeatureCollection";
  features: Feature<P>[];
}

export interface SegmentProperties {
  id: string | number;
  /** Corridor risk score, 0-1. */
  risk: number;
  rank: number;
  voltage_kv: number | null;
  operator: string | null;
  length_m: number | null;
  /** Nearest town, for human-readable labelling. */
  locality: string | null;
  drivers: Drivers | null;
}

export interface FireProperties {
  date: string;
  area_ha: number | null;
  source: string | null;
}

/** A single NASA FIRMS active-fire detection (last ~24h), served by /api/live-fires. */
export interface LiveFireProperties {
  /** Acquisition date, 'YYYY-MM-DD'. */
  acq_date: string;
  /** Acquisition time, pre-formatted as 'HH:MM UTC'. */
  acq_time: string;
  /** Satellite name, e.g. "Suomi NPP" / "NOAA-20". */
  satellite: string;
  /** FIRMS detection confidence: "low" | "nominal" | "high". */
  confidence: string;
  /** Fire radiative power, MW. */
  frp: number;
  /** Brightness temperature (VIIRS I-4 channel), Kelvin. */
  brightness: number;
  /** "D" (day) or "N" (night) overpass. */
  daynight: string;
}

export type SegmentFeature = Feature<SegmentProperties>;
export type SegmentCollection = FeatureCollection<SegmentProperties>;
export type FireCollection = FeatureCollection<FireProperties>;
export type LiveFireFeature = Feature<LiveFireProperties>;
export type LiveFireCollection = FeatureCollection<LiveFireProperties>;

export type Selection =
  | { kind: "cell"; cell: Cell }
  | { kind: "segment"; feature: SegmentFeature };
