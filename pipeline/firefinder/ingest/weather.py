"""ERA5-derived daily weather from the Open-Meteo historical archive (no auth).

A 0.25 deg sample grid over the region; cells snap to their nearest point.
"""

import time

import numpy as np
import pandas as pd
import requests

from firefinder import regions
from firefinder.config import DATA_DIR

API = "https://archive-api.open-meteo.com/v1/archive"
POWER_API = "https://power.larc.nasa.gov/api/temporal/daily/point"


class QuotaExceeded(RuntimeError):
    pass
DAILY = "temperature_2m_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,et0_fao_evapotranspiration"
START, END = "2019-06-01", "2026-07-26"
BATCH = 6


def _year_chunks():
    """One (start, end) per calendar year — a full multi-year hourly request is
    over the API's per-call size limit."""
    edges = pd.date_range(START, END, freq="YS").tolist()
    bounds = [pd.Timestamp(START)] + edges + [pd.Timestamp(END)]
    out = []
    for a, b in zip(bounds, bounds[1:]):
        if a >= b:
            continue
        end = min(b - pd.Timedelta(days=1), pd.Timestamp(END))
        out.append((a.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")))
    return out


def grid_points(region, step=None):
    step = step or getattr(region, "weather_step", 0.25)
    w, s, e, n = region.bbox
    lats = np.arange(s + step / 2, n, step)
    lons = np.arange(w + step / 2, e, step)
    return [(round(la, 3), round(lo, 3)) for la in lats for lo in lons]


def _fetch_batch(points, start, end):
    params = {
        "latitude": ",".join(str(p[0]) for p in points),
        "longitude": ",".join(str(p[1]) for p in points),
        "start_date": start,
        "end_date": end,
        "daily": DAILY,
        "hourly": "relative_humidity_2m",
        "timezone": "UTC",
    }
    for attempt in range(8):
        r = requests.get(API, params=params, timeout=300)
        if r.status_code == 200:
            body = r.json()
            return body if isinstance(body, list) else [body]
        if r.status_code == 429 and "Daily" in r.text:
            raise QuotaExceeded(r.text[:200])
        # minutely rate limit needs a real pause, not exponential-from-1s
        time.sleep(70 if r.status_code == 429 else 2**attempt)
    if r.status_code == 429:
        # hourly/other quota that outlasted every retry — same remedy as daily
        raise QuotaExceeded(r.text[:200])
    r.raise_for_status()


def _fetch_point_power(pt) -> pd.DataFrame:
    """NASA POWER daily fallback — keyless, whole date range in one call.

    No gust or ET0 parameters exist here, and RH2M is a daily mean rather than
    a minimum; those become NaN / proxy columns. Fine for training as long as a
    region's weather comes consistently from one provider.
    """
    params = {
        "parameters": "T2M_MAX,RH2M,WS10M_MAX,PRECTOTCORR",
        "community": "AG",
        "latitude": pt[0],
        "longitude": pt[1],
        "start": START.replace("-", ""),
        "end": END.replace("-", ""),
        "format": "JSON",
    }
    for attempt in range(6):
        r = requests.get(POWER_API, params=params, timeout=300)
        if r.status_code == 200:
            p = r.json()["properties"]["parameter"]
            df = pd.DataFrame(
                {
                    "date": pd.to_datetime(list(p["T2M_MAX"]), format="%Y%m%d").date,
                    "tmax": list(p["T2M_MAX"].values()),
                    "rh_min": list(p["RH2M"].values()),
                    "wind_max": [v * 3.6 if v is not None else None for v in p["WS10M_MAX"].values()],
                    "precip": list(p["PRECTOTCORR"].values()),
                }
            )
            df["gust_max"] = float("nan")
            df["et0"] = float("nan")
            df = df.replace(-999, float("nan")).dropna(subset=["tmax"])
            df["lat"], df["lon"] = pt
            return df
        time.sleep(3 * 2**attempt)
    r.raise_for_status()


def run(region: str):
    reg = regions.get(region)
    out_path = DATA_DIR / "processed" / reg.id / "weather.parquet"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    interim = DATA_DIR / "interim" / reg.id / "weather"
    interim.mkdir(parents=True, exist_ok=True)
    points = grid_points(reg)
    try:
        frames = _run_openmeteo(points, interim)
    except QuotaExceeded:
        # One region = one provider, so drop partial Open-Meteo caches and
        # refetch everything from NASA POWER.
        print("Open-Meteo daily quota exhausted — switching to NASA POWER")
        for f in interim.glob("batch_*.parquet"):
            f.unlink()
        frames = []
        for i, pt in enumerate(points):
            cache = interim / f"power_{i:03d}.parquet"
            if cache.exists():
                frames.append(pd.read_parquet(cache))
                continue
            df = _fetch_point_power(pt)
            df.to_parquet(cache, index=False)
            frames.append(df)
            if (i + 1) % 10 == 0:
                print(f"{i + 1}/{len(points)} points (POWER)")
    out = pd.concat(frames, ignore_index=True)
    out_path = DATA_DIR / "processed" / reg.id / "weather.parquet"
    out.to_parquet(out_path, index=False)
    print(f"{len(out)} point-days -> {out_path.name}")


def _run_openmeteo(points, interim):
    frames = []
    for i in range(0, len(points), BATCH):
        batch = points[i : i + BATCH]
        cache = interim / f"batch_{i:03d}.parquet"
        if cache.exists():
            frames.append(pd.read_parquet(cache))
            continue
        batch_frames = []
        for start, end in _year_chunks():
            for pt, loc in zip(batch, _fetch_batch(batch, start, end)):
                daily = pd.DataFrame(loc["daily"])
                daily["date"] = pd.to_datetime(daily["time"]).dt.date
                rh = pd.DataFrame(loc["hourly"])
                rh["date"] = pd.to_datetime(rh["time"]).dt.date
                rh_min = rh.groupby("date")["relative_humidity_2m"].min().rename("rh_min")
                df = daily.drop(columns="time").merge(rh_min, on="date")
                df = df.rename(
                    columns={
                        "temperature_2m_max": "tmax",
                        "precipitation_sum": "precip",
                        "wind_speed_10m_max": "wind_max",
                        "wind_gusts_10m_max": "gust_max",
                        "et0_fao_evapotranspiration": "et0",
                    }
                )
                df["lat"], df["lon"] = pt
                batch_frames.append(df)
            time.sleep(0.4)
        combined = pd.concat(batch_frames, ignore_index=True)
        combined.to_parquet(cache, index=False)
        frames.append(combined)
        print(f"{min(i + BATCH, len(points))}/{len(points)} points")
    return frames
