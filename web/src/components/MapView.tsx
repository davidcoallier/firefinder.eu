"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  GeoJsonLayer,
  H3HexagonLayer,
  TextLayer,
  type Layer,
  type PickingInfo,
} from "deck.gl";
import {
  buildMapStyle,
  SATELLITE_SOURCE_ID,
  type BasemapMode,
} from "@/lib/basemap";
import type { Jurisdiction } from "@/lib/regions";
import type {
  Cell,
  FireCollection,
  LiveFireCollection,
  LiveFireFeature,
  SegmentCollection,
  SegmentFeature,
  Selection,
} from "@/lib/types";
import {
  ACCENT_SELECT,
  corridorColor,
  corridorWidth,
  formatPct,
  riskColor,
  riskTier,
} from "@/lib/colors";

/** Consecutive satellite tile failures before we report the source as broken. */
const SATELLITE_ERROR_LIMIT = 3;

export type MapFocus = {
  bounds: [[number, number], [number, number]];
  /** Bump to re-trigger the flyTo even for the same bounds. */
  key: number;
};

type MapViewProps = {
  region: Jurisdiction;
  basemap: BasemapMode;
  /** Fired once when satellite tiles repeatedly fail (e.g. blocked network). */
  onSatelliteFailure?: () => void;
  cells: Cell[];
  segments: SegmentCollection | null;
  fires: FireCollection | null;
  liveFires: LiveFireCollection | null;
  showCells: boolean;
  showSegments: boolean;
  showFires: boolean;
  showLiveFires: boolean;
  onSelectLiveFire: (feature: LiveFireFeature | null) => void;
  gridContext: GeoJSON.FeatureCollection | null;
  cellOpacity: number;
  threshold: number;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  focus: MapFocus | null;
};

function isSegmentFeature(obj: unknown): obj is SegmentFeature {
  const f = obj as SegmentFeature | null;
  return !!f && f.type === "Feature" && f.properties != null && "risk" in f.properties;
}

function isLiveFireFeature(obj: unknown): obj is LiveFireFeature {
  const f = obj as LiveFireFeature | null;
  return (
    !!f &&
    f.type === "Feature" &&
    f.properties != null &&
    "frp" in f.properties &&
    "acq_date" in f.properties
  );
}

/** 16px base, growing with fire radiative power up to ~30px for frp > 50 MW. */
function liveFireSize(frp: number): number {
  return 16 + Math.min(14, Math.max(0, frp) * (14 / 50));
}

// Light tooltip card (deck.gl's default is dark).
const TOOLTIP_STYLE: Partial<CSSStyleDeclaration> = {
  background: "#ffffff",
  color: "#1e293b",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  boxShadow: "0 2px 10px rgba(15, 23, 42, 0.12)",
  fontSize: "13px",
  padding: "6px 10px",
};

function getTooltip(
  info: PickingInfo
): { text: string; style: Partial<CSSStyleDeclaration> } | null {
  const obj = info.object as unknown;
  if (!obj) return null;
  if (isLiveFireFeature(obj)) {
    const p = obj.properties;
    return {
      text: `Active fire — detected ${p.acq_date} ${p.acq_time}`,
      style: TOOLTIP_STYLE,
    };
  }
  if (isSegmentFeature(obj)) {
    const p = obj.properties;
    const where = p.locality ? `Near ${p.locality}` : `Corridor #${p.rank}`;
    return {
      text: `${where} — ${riskTier(p.risk).label} risk (${formatPct(p.risk)})`,
      style: TOOLTIP_STYLE,
    };
  }
  const cell = obj as Cell;
  if (typeof cell.p === "number") {
    return {
      text: `Ignition probability ${formatPct(cell.p)}`,
      style: TOOLTIP_STYLE,
    };
  }
  return null;
}

export default function MapView({
  region,
  basemap,
  onSatelliteFailure,
  cells,
  segments,
  fires,
  liveFires,
  showCells,
  showSegments,
  showFires,
  showLiveFires,
  onSelectLiveFire,
  gridContext,
  cellOpacity,
  threshold,
  selection,
  onSelect,
  focus,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const onSelectRef = useRef(onSelect);
  const onSelectLiveFireRef = useRef(onSelectLiveFire);
  const onSatelliteFailureRef = useRef(onSatelliteFailure);
  /** "mode|jurisdictionId" of the style currently applied to the map. */
  const styleKeyRef = useRef<string | null>(null);
  const flownRegionIdRef = useRef<string | null>(null);
  const satelliteErrorsRef = useRef(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onSelectLiveFireRef.current = onSelectLiveFire;
  }, [onSelectLiveFire]);
  useEffect(() => {
    onSatelliteFailureRef.current = onSatelliteFailure;
  }, [onSatelliteFailure]);

  // Init map once. Style + camera use whatever props are current at mount;
  // later changes are handled by the setStyle / flyTo effects below.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(basemap, region.coverageBbox),
      center: region.center,
      zoom: region.zoom,
      attributionControl: { compact: true },
    });
    styleKeyRef.current = `${basemap}|${region.id}`;
    if (process.env.NODE_ENV === "development") {
      (window as unknown as Record<string, unknown>).__ff_map = map;
    }
    flownRegionIdRef.current = region.id;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // Detect repeated satellite tile failures (ad-blockers, offline) so the
    // app can fall back to the self-contained plain basemap. Other errors are
    // logged: attaching any 'error' listener disables maplibre's default log.
    map.on("error", (e) => {
      const ev = e as { sourceId?: string; error?: Error };
      if (ev.sourceId === SATELLITE_SOURCE_ID) {
        satelliteErrorsRef.current += 1;
        if (satelliteErrorsRef.current === SATELLITE_ERROR_LIMIT) {
          onSatelliteFailureRef.current?.();
        }
        return;
      }
      console.error(ev.error ?? e);
    });

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      getTooltip,
      onClick: (info: PickingInfo) => {
        // Click on empty space clears the selection(s).
        if (!info.layer) {
          onSelectRef.current(null);
          onSelectLiveFireRef.current(null);
        }
      },
    });
    // Non-interleaved MapboxOverlay is an IControl drawing to its own canvas;
    // controls are not part of the style, so it survives map.setStyle below.
    map.addControl(overlay as unknown as maplibregl.IControl);

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      overlayRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the basemap style when the mode (or jurisdiction coverage) changes.
  // setStyle diffs by default, so a coverage-only change is a cheap patch.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const key = `${basemap}|${region.id}`;
    if (styleKeyRef.current === key) return;
    styleKeyRef.current = key;
    map.setStyle(buildMapStyle(basemap, region.coverageBbox));
  }, [basemap, region]);

  // Fly to the jurisdiction when it changes (initial camera is set at init).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || flownRegionIdRef.current === region.id) return;
    flownRegionIdRef.current = region.id;
    map.flyTo({
      center: region.center,
      zoom: region.zoom,
      duration: 1600,
      essential: true,
    });
  }, [region]);

  // Rebuild deck layers whenever inputs change.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const selectedSegmentId =
      selection?.kind === "segment" ? selection.feature.properties.id : null;
    const selectedCellId = selection?.kind === "cell" ? selection.cell.h3 : null;

    const layers: Layer[] = [];

    // Plain mode draws land through deck: maplibre fetches geojson sources in
    // a worker where our local asset URL silently fails, so we bypass it.
    if (basemap === "plain") {
      layers.push(
        new GeoJsonLayer({
          id: "plain-countries",
          data: "/basemap/countries.geojson",
          stroked: true,
          filled: true,
          getFillColor: [244, 241, 234, 255],
          getLineColor: [174, 182, 194, 255],
          lineWidthMinPixels: 1,
          pickable: false,
        })
      );
    }

    // Full grid network as neutral context under everything risk-colored.
    if (showSegments && gridContext) {
      layers.push(
        new GeoJsonLayer({
          id: "grid-context",
          data: gridContext,
          stroked: false,
          filled: false,
          getLineColor:
            basemap === "satellite" ? [235, 238, 242, 120] : [125, 130, 140, 80],
          lineWidthMinPixels: 1,
          getLineWidth: 1,
          lineWidthUnits: "pixels",
          pickable: false,
          updateTriggers: { getLineColor: [basemap] },
        })
      );
    }

    if (showFires && fires) {
      layers.push(
        new GeoJsonLayer({
          id: "fires",
          data: fires as unknown as GeoJSON.FeatureCollection,
          stroked: true,
          filled: true,
          getFillColor: [200, 55, 40, 22],
          getLineColor: [170, 45, 40, 150],
          lineWidthMinPixels: 1,
          pickable: false,
        })
      );
    }

    if (showCells) {
      layers.push(
        new H3HexagonLayer<Cell>({
          id: "cells",
          data: cells.filter((c) => c.p >= threshold),
          getHexagon: (d) => d.h3,
          filled: true,
          extruded: false,
          stroked: false,
          getFillColor: (d) =>
            d.h3 === selectedCellId
              ? ACCENT_SELECT
              : riskColor(d.p, cellOpacity, basemap),
          pickable: true,
          onClick: (info) => {
            const cell = info.object as Cell | undefined;
            if (cell) onSelectRef.current({ kind: "cell", cell });
            return true;
          },
          updateTriggers: {
            getFillColor: [cellOpacity, selectedCellId, basemap],
          },
        })
      );
    }

    if (showSegments && segments) {
      layers.push(
        new GeoJsonLayer({
          id: "segments",
          data: segments as unknown as GeoJSON.FeatureCollection,
          stroked: false,
          filled: false,
          getLineColor: (f) => {
            const props = (f as unknown as SegmentFeature).properties;
            if (props.id === selectedSegmentId) return ACCENT_SELECT;
            return corridorColor(props.risk, basemap);
          },
          getLineWidth: (f) => {
            const props = (f as unknown as SegmentFeature).properties;
            if (props.id === selectedSegmentId)
              return Math.max(3, corridorWidth(props.risk));
            return corridorWidth(props.risk);
          },
          lineWidthUnits: "pixels",
          lineWidthMinPixels: 1.2,
          pickable: true,
          onClick: (info) => {
            const feature = info.object as unknown as SegmentFeature | undefined;
            if (feature) onSelectRef.current({ kind: "segment", feature });
            return true;
          },
          updateTriggers: {
            getLineColor: [selectedSegmentId, basemap],
            getLineWidth: [selectedSegmentId],
          },
        })
      );
    }

    // Live fires stay last so detections draw above cells and corridors.
    if (showLiveFires && liveFires && liveFires.features.length > 0) {
      layers.push(
        new TextLayer<LiveFireFeature>({
          id: "live-fires",
          data: liveFires.features,
          getPosition: (f) => f.geometry.coordinates as [number, number],
          getText: () => "🔥",
          getSize: (f) => liveFireSize(f.properties.frp),
          sizeUnits: "pixels",
          characterSet: ["🔥"],
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
          pickable: true,
          onClick: (info) => {
            const feature = info.object as LiveFireFeature | undefined;
            if (feature) onSelectLiveFireRef.current(feature);
            return true;
          },
        })
      );
    }

    overlay.setProps({ layers });
  }, [cells, segments, fires, liveFires, gridContext, showCells, showSegments, showFires, showLiveFires, cellOpacity, threshold, selection, basemap]);

  // Fly to a focus target (e.g. a segment picked from the list).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.fitBounds(focus.bounds, { padding: 100, maxZoom: 12.5, duration: 900 });
  }, [focus]);

  // h-full/w-full because maplibre's stylesheet overrides `absolute` with
  // position:relative on .maplibregl-map, which zeroes out inset-0 sizing
  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}
