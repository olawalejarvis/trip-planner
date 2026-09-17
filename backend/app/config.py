from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    database_url: str = (
        "postgresql+psycopg://trip_planner:trip_planner@localhost:5434/trip_planner"
    )
    timetrack_url: str = "https://www.metrobus.co.ca/api/timetrack/json/"
    timetrack_cache_ttl_seconds: int = 30

    metrobus_attribution: str = (
        "Data used in this product or service is provided by Metrobus Transit, "
        "however Metrobus Transit assumes no responsibility for the accuracy or "
        "currency of the data."
    )


settings = Settings()
