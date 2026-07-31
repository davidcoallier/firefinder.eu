-- Ensemble scoring: per-cell member disagreement, exposed in the paged cells
-- API as `s` so the UI can distinguish confident risk from contested risk.

alter table cell_scores add column if not exists p_spread real;

create or replace function api_cells(
  p_region text,
  p_week date,
  p_limit int default 25000,
  p_offset int default 0
)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'h3', t.h3, 'p', t.p, 's', t.s)), '[]'::jsonb)
  from (
    select cs.h3,
           round(cs.p_ignition::numeric, 4) as p,
           round(coalesce(cs.p_spread, 0)::numeric, 4) as s
    from cell_scores cs
    where cs.region_id = p_region and cs.week = p_week
      and cs.p_ignition >= 0.01
    order by cs.p_ignition desc, cs.h3
    limit least(p_limit, 25000) offset p_offset
  ) t;
$$;
