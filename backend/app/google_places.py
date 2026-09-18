"""Server-side client for Google Places API (New) Text Search.

Called from our own backend rather than the mobile app: Google API keys
restricted by HTTP referrer (the norm for browser use) reject requests with no
referrer, which a mobile app's fetch never sends, so there's no restriction
mode that both works from a bare mobile client and doesn't leave the key
wide open once shipped in the app bundle. Keeping the call server-side avoids
shipping the key to the client at all.
"""

import httpx

from app.config import settings

PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"


def search(query: str, lat: float, lng: float) -> list[dict]:
    if not settings.google_maps_api_key:
        return []

    resp = httpx.post(
        PLACES_SEARCH_URL,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": settings.google_maps_api_key,
            "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
        },
        json={
            "textQuery": query,
            "regionCode": "CA",
            "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 50_000}},
        },
        timeout=10,
    )
    resp.raise_for_status()
    places = resp.json().get("places", [])

    return [
        {
            "label": p.get("formattedAddress") or p.get("displayName", {}).get("text") or query,
            "lat": p["location"]["latitude"],
            "lng": p["location"]["longitude"],
        }
        for p in places
        if p.get("location")
    ]
