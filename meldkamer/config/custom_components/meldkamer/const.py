"""Constanten voor de Meldkamer-koppeling."""

DOMAIN = "meldkamer"
EVENT_MELDING = "meldkamer_melding"

# Standaard bronnen. Alles is gratis en zonder account te gebruiken.
# Ze kunnen in meldkamer_instellingen.yaml onder `bronnen:` overschreven worden.
STANDAARD_BRONNEN = {
    # P2000: de eerste feed die werkt wordt gebruikt.
    "p2000": [
        "https://feeds.livep2000.nl/?d=1",
        "https://www.alarmeringen.nl/feeds/discipline/brandweer.rss",
    ],
    "geocoder": "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free",
    "route_auto": "https://routing.openstreetmap.de/routed-car",
    "route_fiets": "https://routing.openstreetmap.de/routed-bike",
    "weer": "https://api.open-meteo.com/v1/forecast",
    "lucht": "https://air-quality-api.open-meteo.com/v1/air-quality",
    "regen": "https://gpsgadget.buienradar.nl/data/raintext",
    "knmi": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-netherlands",
    "vliegtuigen": [
        "https://api.airplanes.live/v2/point",
        "https://api.adsb.lol/v2/point",
    ],
}

USER_AGENT = "Meldkamer-Dashboard/1.0 (Home Assistant)"
