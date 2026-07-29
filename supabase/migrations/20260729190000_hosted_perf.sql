-- Hosted Supabase caps anon statements at 3s. Spain-scale api_weeks scanned
-- 300k+ score rows and blew it; give the roles headroom and make api_weeks
-- read from the top-ranked corridor rows only (one per region-week).

alter role anon set statement_timeout = '15s';
alter role authenticated set statement_timeout = '15s';

create index if not exists segment_scores_top_rank_idx
  on segment_scores (week) where rank_in_region = 1;

create or replace function api_weeks(p_region text)
returns date[] language sql stable as $$
  select coalesce(array_agg(w order by w desc), '{}')
  from (
    select distinct ss.week as w
    from segment_scores ss
    join line_segments ls on ls.id = ss.segment_id
    where ss.rank_in_region = 1 and ls.region_id = p_region
  ) t;
$$;
