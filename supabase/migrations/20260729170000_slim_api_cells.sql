-- Country-scale regions (Spain: 96k cells) time out when api_cells ships every
-- cell with its drivers. Slim the bulk call to visible cells only and move
-- per-cell drivers to an on-demand lookup.

create or replace function api_cells(p_region text, p_week date)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'h3', cs.h3, 'p', round(cs.p_ignition::numeric, 4))), '[]'::jsonb)
  from cell_scores cs
  join cells c on c.h3 = cs.h3
  where c.region_id = p_region and cs.week = p_week
    and cs.p_ignition >= 0.01;
$$;

create or replace function api_cell_drivers(p_h3 text, p_week date)
returns jsonb language sql stable as $$
  select coalesce(cs.drivers, '{}'::jsonb)
  from cell_scores cs
  where cs.h3 = p_h3 and cs.week = p_week;
$$;

grant execute on function api_cell_drivers(text, date) to anon;
