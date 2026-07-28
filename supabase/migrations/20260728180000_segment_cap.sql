-- Full-country regions have 60k+ segments; the API returns only the ranked
-- top slice. The complete network ships as a static context asset instead.
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
        'locality', ls.locality,
        'drivers', ss.drivers
      )) order by ss.rank_in_region)),
    jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb))
  from segment_scores ss
  join line_segments ls on ls.id = ss.segment_id
  where ls.region_id = p_region and ss.week = p_week
    and ss.rank_in_region <= 2500;
$$;
