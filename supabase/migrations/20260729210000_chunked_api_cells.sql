-- Spain's cell payload (~90k rows) can't reliably ship in one anon statement.
-- Page it, ordered by risk descending so the map paints worst-first, and make
-- PostgREST actually pick up the role timeout raised in the previous
-- migration (role settings need a config reload to apply to API calls).

drop function if exists api_cells(text, date);

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
    join cells c on c.h3 = cs.h3
    where c.region_id = p_region and cs.week = p_week
      and cs.p_ignition >= 0.01
    order by cs.p_ignition desc, cs.h3
    limit least(p_limit, 25000) offset p_offset
  ) t;
$$;

grant execute on function api_cells(text, date, int, int) to anon;

create index if not exists cell_scores_week_p_idx
  on cell_scores (week, p_ignition desc);

notify pgrst, 'reload config';
