"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, H3HexagonLayer, type Layer, type PickingInfo } from "deck.gl";
import type { Region } from "@/lib/regions";
import type {
  Cell,
  FireCollection,
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

// Light, terrain-tinted basemap with town/road labels — keeps geographic
// context visible at every zoom level.
const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

export type MapFocus = {
  bounds: [[number, number], [number, number]];
  /** Bump to re-trigger the flyTo even for the same bounds. */
  key: number;
};

type MapViewProps = {
  region: Region;
  cells: Cell[];
  segments: SegmentCollection | null;
  fires: FireCollection | null;
  showCells: boolean;
  showSegments: boolean;
  showFires: boolean;
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
  cells,
  segments,
  fires,
  showCells,
  showSegments,
  showFires,
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

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: region.center,
      zoom: region.zoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      getTooltip,
      onClick: (info: PickingInfo) => {
        // Click on empty space clears the selection.
        if (!info.layer) onSelectRef.current(null);
      },
    });
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

  // Rebuild deck layers whenever inputs change.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const selectedSegmentId =
      selection?.kind === "segment" ? selection.feature.properties.id : null;
    const selectedCellId = selection?.kind === "cell" ? selection.cell.h3 : null;

    const layers: Layer[] = [];

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
              : riskColor(d.p, cellOpacity),
          pickable: true,
          onClick: (info) => {
            const cell = info.object as Cell | undefined;
            if (cell) onSelectRef.current({ kind: "cell", cell });
            return true;
          },
          updateTriggers: {
            getFillColor: [cellOpacity, selectedCellId],
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
            return corridorColor(props.risk);
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
            getLineColor: [selectedSegmentId],
            getLineWidth: [selectedSegmentId],
          },
        })
      );
    }

    overlay.setProps({ layers });
  }, [cells, segments, fires, showCells, showSegments, showFires, cellOpacity, threshold, selection]);

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
