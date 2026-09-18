from fastapi import APIRouter, Query

from app import google_places

router = APIRouter(tags=["geocode"])

# Biases search toward Metrobus's coverage area (St. John's / Mount Pearl / Paradise),
# same constant the mobile app already uses for its own MapTiler fallback.
DEFAULT_PROXIMITY = {"lat": 47.5675, "lng": -52.7407}


@router.get("/geocode")
def geocode(q: str = Query(min_length=3)):
    return google_places.search(q, DEFAULT_PROXIMITY["lat"], DEFAULT_PROXIMITY["lng"])
