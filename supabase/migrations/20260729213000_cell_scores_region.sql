-- Page queries were sorting ~90k join rows per page on hosted hardware.
-- Denormalize the region onto cell_scores so a page is one index range scan.

alter table cell_scores add column if not exists region_id text;

update cell_scores cs set region_id = c.region_id
from cells c where c.h3 = cs.h3 and cs.region_id is null;

create index if not exists cell_scores_region_week_p_idx
  on cell_scores (region_id, week, p_ignition desc);

drop index if exists cell_scores_week_p_idx;

create or replace function api_cells(
  p_region text,
  p_week date,
  p_limit int default 25000,
  p_offset int default 0
)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('h3', t.h3, 'p', t.p)), '[]'::jsonb)
  from (
    select cs.h3, round(cs.p_ignition::numeric, 4) as p
    from cell_scores cs
    where cs.region_id = p_region and cs.week = p_week
      and cs.p_ignition >= 0.01
    order by cs.p_ignition desc, cs.h3
    limit least(p_limit, 25000) offset p_offset
  ) t;
$$;
