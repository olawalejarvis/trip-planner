from fastapi import FastAPI

from app.config import settings
from app.routers import geocode, routes, stops, trip_plan, trips, vehicles

app = FastAPI(title="Newfoundland Trip Planner API")

app.include_router(routes.router)
app.include_router(stops.router)
app.include_router(vehicles.router)
app.include_router(trip_plan.router)
app.include_router(trips.router)
app.include_router(geocode.router)


@app.get("/about")
def about():
    return {
        "name": "Newfoundland Trip Planner API",
        "data_attribution": settings.metrobus_attribution,
        "sources": [
            {"agency": "Metrobus Transit", "type": "GTFS static", "url": "https://www.metrobus.com/gtfs.asp"},
            {"agency": "Metrobus Transit", "type": "Live vehicle positions (unofficial)", "url": settings.timetrack_url},
        ],
    }
