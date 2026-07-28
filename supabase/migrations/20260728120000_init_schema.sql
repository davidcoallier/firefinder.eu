-- Firefinder core schema
-- Risk scores are computed offline by the Python pipeline and written here;
-- the web app only reads.

create extension if not exists postgis;

-- Study regions (iberia-france first, california later)
create table regions (
  id text primary key,              -- e.g. 'eu-southwest', 'us-california'
  name text not null,
  bbox geometry(Polygon, 4326) not null,
  created_at timestamptz not null default now()
);

-- ~1km analysis cells (H3 res 7). Static features live here;
-- weekly dynamic features stay in the pipeline's parquet store.
create table cells (
  h3 text primary key,
  region_id text not null references regions(id),
  geom geometry(Polygon, 4326) not null,
  elevation_m real,
  slope_deg real,
  landcover smallint,               -- ESA WorldCover class
  dist_powerline_m real             -- distance to nearest OSM power line
);
create index cells_geom_idx on cells using gist (geom);
create index cells_region_idx on cells (region_id);

-- Power line corridors from OSM (merged/segmented by the pipeline)
create table line_segments (
  id bigint generated always as identity primary key,
  region_id text not null references regions(id),
  osm_way_ids bigint[] not null,
  voltage_kv real,
  operator text,
  length_m real not null,
  geom geometry(LineString, 4326) not null
);
create index line_segments_geom_idx on line_segments using gist (geom);
create index line_segments_region_idx on line_segments (region_id);

-- Historical fire events used as labels and shown on the map
create table fire_events (
  id bigint generated always as identity primary key,
  region_id text not null references regions(id),
  source text not null,             -- 'effis' | 'firms' | 'calfire' | 'cpuc'
  event_date date not null,
  area_ha real,
  geom geometry(Geometry, 4326) not null
);
create index fire_events_geom_idx on fire_events using gist (geom);
create index fire_events_date_idx on fire_events (event_date);

-- Weekly per-cell risk predictions
create table cell_scores (
  h3 text not null references cells(h3),
  week date not null,               -- monday of the forecast week
  p_ignition real not null,
  drivers jsonb,                    -- top SHAP contributions, plain-language keys
  model_version text not null,
  primary key (h3, week)
);
create index cell_scores_week_idx on cell_scores (week);

-- Weekly per-segment corridor risk (what the UI ranks)
create table segment_scores (
  segment_id bigint not null references line_segments(id),
  week date not null,
  risk real not null,               -- aggregated corridor risk 0-1
  rank_in_region int not null,
  drivers jsonb,
  model_version text not null,
  primary key (segment_id, week)
);
create index segment_scores_week_idx on segment_scores (week, rank_in_region);

-- Read-only access for the web app's anon role
grant usage on schema public to anon;
grant select on regions, cells, line_segments, fire_events, cell_scores, segment_scores to anon;
alter table regions enable row level security;
alter table cells enable row level security;
alter table line_segments enable row level security;
alter table fire_events enable row level security;
alter table cell_scores enable row level security;
alter table segment_scores enable row level security;
create policy read_all on regions for select using (true);
create policy read_all on cells for select using (true);
create policy read_all on line_segments for select using (true);
create policy read_all on fire_events for select using (true);
create policy read_all on cell_scores for select using (true);
create policy read_all on segment_scores for select using (true);
