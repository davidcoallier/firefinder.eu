-- Read API for the web app. All functions are stable, read-only, anon-executable.

-- Available forecast weeks for a region, newest first
create or replace function api_weeks(p_region text)
returns date[] language sql stable as $$
  select coalesce(array_agg(distinct cs.week order by cs.week desc), '{}')
  from cell_scores cs
  join cells c on c.h3 = cs.h3
  where c.region_id = p_region;
$$;

-- Per-cell risk for a week: [{h3, p, drivers}] — geometry not needed,
-- deck.gl renders H3 indexes directly.
create or replace function api_cells(p_region text, p_week date)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'h3', cs.h3, 'p', round(cs.p_ignition::numeric, 4), 'drivers', cs.drivers)), '[]'::jsonb)
  from cell_scores cs
  join cells c on c.h3 = cs.h3
  where c.region_id = p_region and cs.week = p_week;
$$;

-- Ranked corridor segments for a week as GeoJSON
create or replace function api_segments(p_region text, p_week date)
returns jsonb language sql stable as $$
  select coalesce(jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'geometry', st_asgeojson(ls.geom, 5)::jsonb,
      'properties', jsonb_build_object(
        'id', ls.id,
        'risk', round(ss.risk::numeric, 4),
        'rank', ss.rank_in_region,
        'voltage_kv', ls.voltage_kv,
        'operator', ls.operator,
        'length_m', round(ls.length_m::numeric),
        'drivers', ss.drivers
      )) order by ss.rank_in_region)),
    jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb))
  from segment_scores ss
  join line_segments ls on ls.id = ss.segment_id
  where ls.region_id = p_region and ss.week = p_week;
$$;

-- Historical fire perimeters (simplified for display)
create or replace function api_fires(p_region text)
returns jsonb language sql stable as $$
  select coalesce(jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'geometry', st_asgeojson(st_simplifypreservetopology(f.geom, 0.001), 5)::jsonb,
      'properties', jsonb_build_object(
        'date', f.event_date, 'area_ha', f.area_ha, 'source', f.source)))),
    jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb))
  from fire_events f
  where f.region_id = p_region;
$$;

grant execute on function api_weeks(text), api_cells(text, date),
  api_segments(text, date), api_fires(text) to anon;
