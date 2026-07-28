"""Central config. All secrets come from pipeline/.env (never committed)."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / "pipeline" / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Copernicus Data Space (Sentinel-2) — https://dataspace.copernicus.eu
    cdse_client_id: str = ""
    cdse_client_secret: str = ""

    # Climate Data Store (ERA5) — https://cds.climate.copernicus.eu
    cds_api_key: str = ""

    # NASA FIRMS — https://firms.modaps.eosdis.nasa.gov/api/
    firms_map_key: str = ""

    # Local Supabase (55420 range — see supabase/config.toml)
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:55422/postgres"


settings = Settings()
