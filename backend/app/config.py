from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    database_url: str = (
        "postgresql+psycopg://trip_planner:trip_planner@localhost:5434/trip_planner"
    )
    timetrack_url: str = "https://www.metrobus.co.ca/api/timetrack/json/"
    timetrack_cache_ttl_seconds: int = 30
    # TimeTrack keeps returning each vehicle's last known position long after
    # it has gone out of service (confirmed: overnight it still reports every
    # bus at its last position from the morning), so anything older than this
    # is dropped rather than shown as if it were live.
    timetrack_stale_after_seconds: int = 300

    # Optional. When set, /geocode calls Google Places (New) Text Search server-side
    # (better rural/civic address coverage than MapTiler's OSM-derived data) and the
    # mobile app falls back to its own MapTiler geocoding if this is unset or fails.
    google_maps_api_key: str = ""

    metrobus_attribution: str = (
        "Data used in this product or service is provided by Metrobus Transit, "
        "however Metrobus Transit assumes no responsibility for the accuracy or "
        "currency of the data."
    )


settings = Settings()
