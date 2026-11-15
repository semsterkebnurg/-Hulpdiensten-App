"""Meldkamer: brandweermeldingen, weer, vliegtuigen en meer voor het dashboard."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
import logging
import math
from typing import Any
from urllib.parse import quote

import aiohttp
import voluptuous as vol

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv, discovery
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from . import p2000
from .const import DOMAIN, EVENT_MELDING, STANDAARD_BRONNEN, USER_AGENT

_LOGGER = logging.getLogger(__name__)

ROUTE_SCHEMA = vol.Schema({vol.Required("naam"): cv.string, vol.Required("via"): cv.string})

CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Optional("plaats", default="Nunspeet"): cv.string,
                vol.Optional("adres", default=""): cv.string,
                vol.Optional("filter", default=["Nunspeet"]): vol.All(cv.ensure_list, [cv.string]),
                vol.Optional("eigen_eenheden", default=[]): vol.All(cv.ensure_list, [cv.string]),
                vol.Optional("toon_alles", default=False): cv.boolean,
                vol.Optional("routekeuze", default=[]): vol.All(cv.ensure_list, [ROUTE_SCHEMA]),
                vol.Optional("provincie", default="Gelderland"): cv.string,
                vol.Optional("vliegtuig_straal_km", default=30): vol.Coerce(int),
                vol.Optional("webcam", default=""): cv.string,
                vol.Optional("afval", default={}): {cv.string: vol.All(cv.ensure_list, [cv.string])},
                vol.Optional("bronnen", default={}): dict,
                vol.Optional("p2000_interval", default=20): vol.Coerce(int),
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)

MAX_MELDINGEN = 40
MAX_GEZIEN = 800


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    conf = config[DOMAIN]
    bronnen = {**STANDAARD_BRONNEN, **conf.get("bronnen", {})}
    session = async_get_clientsession(hass)
    hub = MeldkamerHub(hass, conf, bronnen, session)
    await hub.async_start()
    hass.data[DOMAIN] = hub

    async def test_melding(call: ServiceCall) -> None:
        await hub.p2000.async_test_melding(call.data.get("tekst"))

    hass.services.async_register(
        DOMAIN,
        "test_melding",
        test_melding,
        schema=vol.Schema({vol.Optional("tekst"): cv.string}),
    )

    hass.async_create_task(
        discovery.async_load_platform(hass, Platform.SENSOR, DOMAIN, {}, config)
    )
    return True


async def _get(session: aiohttp.ClientSession, url: str, params: dict | None = None, soort: str = "json") -> Any:
    async with asyncio.timeout(20):
        async with session.get(url, params=params, headers={"User-Agent": USER_AGENT}) as r:
            r.raise_for_status()
            if soort == "json":
                return await r.json(content_type=None)
            return await r.text()


def _afstand_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class MeldkamerHub:
    """Houdt alle gegevensbronnen bij elkaar."""

    def __init__(self, hass: HomeAssistant, conf: dict, bronnen: dict, session) -> None:
        self.hass = hass
        self.conf = conf
        self.bronnen = bronnen
        self.session = session
        self.lat = hass.config.latitude
        self.lon = hass.config.longitude
        self.routepunten: list[dict] = []
        self.p2000 = P2000Coordinator(self)
        self.weer = self._coordinator("weer", self._weer, timedelta(minutes=10))
        self.lucht = self._coordinator("lucht", self._lucht, timedelta(minutes=30))
        self.regen = self._coordinator("regen", self._regen, timedelta(minutes=5))
        self.knmi = self._coordinator("knmi", self._knmi, timedelta(minutes=10))
        self.vliegtuigen = self._coordinator("vliegtuigen", self._vliegtuigen, timedelta(seconds=20))

    def _coordinator(self, naam, methode, interval) -> DataUpdateCoordinator:
        return DataUpdateCoordinator(
            self.hass,
            _LOGGER,
            config_entry=None,
            name=f"meldkamer_{naam}",
            update_method=methode,
            update_interval=interval,
        )

    async def async_start(self) -> None:
        if self.conf["adres"]:
            punt = await self.geocode(self.conf["adres"])
            if punt:
                self.lat, self.lon = punt["lat"], punt["lon"]
            else:
                _LOGGER.warning("Kon het adres '%s' niet vinden, ik gebruik de locatie van Home Assistant", self.conf["adres"])
        for keuze in self.conf["routekeuze"]:
            punt = await self.coordinaat(keuze["via"])
            if punt:
                self.routepunten.append({**punt, "naam": keuze["naam"]})
            else:
                _LOGGER.warning("Routepunt '%s' niet gevonden", keuze["via"])
        await self.p2000.async_laad()
        for c in (self.p2000, self.weer, self.lucht, self.regen, self.knmi, self.vliegtuigen):
            # Eerste keer verversen, maar een kapotte bron mag het opstarten niet blokkeren.
            self.hass.async_create_task(c.async_refresh())

    # ---------- Locaties en routes ----------

    async def coordinaat(self, tekst: str) -> dict | None:
        """'52.37,5.78' of een adres omzetten naar een coördinaat."""
        delen = tekst.replace(" ", "").split(",")
        if len(delen) == 2:
            try:
                return {"lat": float(delen[0]), "lon": float(delen[1])}
            except ValueError:
                pass
        return await self.geocode(tekst)

    async def geocode(self, tekst: str, plaats_voorkeur: str | None = None) -> dict | None:
        if not tekst:
            return None
        params = {"q": tekst, "rows": 1, "fq": "type:(adres OR weg OR postcode OR woonplaats)"}
        if plaats_voorkeur:
            params["bq"] = f"woonplaatsnaam:{plaats_voorkeur}^2"
        try:
            data = await _get(self.session, self.bronnen["geocoder"], params)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Geocoder fout voor '%s': %s", tekst, err)
            return None
        docs = data.get("response", {}).get("docs", [])
        if not docs:
            return None
        doc = docs[0]
        punt = doc.get("centroide_ll", "")
        try:
            lon, lat = (float(x) for x in punt.replace("POINT(", "").replace(")", "").split())
        except ValueError:
            return None
        return {
            "lat": lat,
            "lon": lon,
            "naam": doc.get("weergavenaam", tekst),
            "plaats": doc.get("woonplaatsnaam", ""),
        }

    async def route(self, profiel: str, punten: list[tuple[float, float]]) -> dict | None:
        coords = ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in punten)
        url = f"{self.bronnen[profiel]}/route/v1/driving/{coords}"
        try:
            data = await _get(self.session, url, {"overview": "false"})
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Route fout (%s): %s", profiel, err)
            return None
        routes = data.get("routes") or []
        if not routes:
            return None
        return {
            "minuten": max(1, round(routes[0]["duration"] / 60)),
            "km": round(routes[0]["distance"] / 1000, 1),
        }

    async def routes_naar(self, lat: float, lon: float) -> dict:
        thuis = (self.lat, self.lon)
        doel = (lat, lon)
        taken = [self.route("route_auto", [thuis, doel]), self.route("route_fiets", [thuis, doel])]
        for p in self.routepunten:
            taken.append(self.route("route_auto", [thuis, (p["lat"], p["lon"]), doel]))
        uitkomst = await asyncio.gather(*taken)
        auto, fiets, *via = uitkomst
        res: dict[str, Any] = {
            "afstand_km": round(_afstand_km(self.lat, self.lon, lat, lon), 1),
            "auto": auto,
            "fiets": fiets,
            "maps_auto": f"https://www.google.com/maps/dir/?api=1&destination={lat:.6f},{lon:.6f}&travelmode=driving",
            "maps_fiets": f"https://www.google.com/maps/dir/?api=1&destination={lat:.6f},{lon:.6f}&travelmode=bicycling",
        }
        opties = [
            {"naam": p["naam"], **r} for p, r in zip(self.routepunten, via) if r
        ]
        if opties:
            opties.sort(key=lambda o: o["minuten"])
            res["routekeuze"] = opties
            beste = opties[0]
            if len(opties) > 1:
                verschil = opties[1]["minuten"] - beste["minuten"]
                res["advies"] = (
                    f"Via {beste['naam']}"
                    + (f" ({verschil} min sneller)" if verschil > 0 else " (even snel)")
                )
            else:
                res["advies"] = f"Via {beste['naam']}"
        if auto and fiets:
            # Met de auto ben je ook tijd kwijt aan instappen en parkeren.
            res["sneller"] = "fiets" if fiets["minuten"] <= auto["minuten"] + 2 else "auto"
        return res

    # ---------- Weer ----------

    async def _weer(self) -> dict:
        params = {
            "latitude": self.lat,
            "longitude": self.lon,
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,"
            "wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,pressure_msl,is_day",
            "hourly": "temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,"
            "precipitation_probability_max,sunrise,sunset,wind_gusts_10m_max",
            "timezone": "Europe/Amsterdam",
            "forecast_days": 5,
            "forecast_hours": 24,
            "wind_speed_unit": "kmh",
        }
        try:
            data = await _get(self.session, self.bronnen["weer"], params)
        except Exception as err:  # noqa: BLE001
            raise UpdateFailed(f"Weer niet beschikbaar: {err}") from err
        h = data.get("hourly", {})
        d = data.get("daily", {})
        uren = [
            {
                "tijd": t,
                "temp": h["temperature_2m"][i],
                "regenkans": (h.get("precipitation_probability") or [None] * 99)[i],
                "regen": h["precipitation"][i],
                "code": h["weather_code"][i],
                "windstoten": h["wind_gusts_10m"][i],
            }
            for i, t in enumerate(h.get("time", []))
        ]
        dagen = [
            {
                "datum": t,
                "code": d["weather_code"][i],
                "max": d["temperature_2m_max"][i],
                "min": d["temperature_2m_min"][i],
                "regen": d["precipitation_sum"][i],
                "regenkans": (d.get("precipitation_probability_max") or [None] * 99)[i],
                "windstoten": d["wind_gusts_10m_max"][i],
                "zonop": d["sunrise"][i],
                "zononder": d["sunset"][i],
            }
            for i, t in enumerate(d.get("time", []))
        ]
        return {"nu": data.get("current", {}), "uren": uren, "dagen": dagen}

    async def _lucht(self) -> dict:
        params = {
            "latitude": self.lat,
            "longitude": self.lon,
            "current": "european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone",
            "timezone": "Europe/Amsterdam",
        }
        try:
            data = await _get(self.session, self.bronnen["lucht"], params)
        except Exception as err:  # noqa: BLE001
            raise UpdateFailed(f"Luchtkwaliteit niet beschikbaar: {err}") from err
        return data.get("current", {})

    async def _regen(self) -> dict:
        try:
            tekst = await _get(
                self.session,
                self.bronnen["regen"],
                {"lat": f"{self.lat:.2f}", "lon": f"{self.lon:.2f}"},
                soort="text",
            )
        except Exception as err:  # noqa: BLE001
            raise UpdateFailed(f"Buienradar niet beschikbaar: {err}") from err
        reeks = []
        for regel in tekst.strip().splitlines():
            if "|" not in regel:
                continue
            waarde, tijd = regel.split("|", 1)
            try:
                w = int(waarde)
            except ValueError:
                continue
            mm = 0.0 if w == 0 else round(10 ** ((w - 109) / 32), 2)
            reeks.append({"tijd": tijd.strip(), "mm": mm})
        samenvatting = "Droog de komende 2 uur"
        nu = reeks[0]["mm"] if reeks else 0
        if reeks:
            if nu >= 0.1:
                droog = next((r for r in reeks if r["mm"] < 0.1), None)
                samenvatting = f"Regen, droog rond {droog['tijd']}" if droog else "Regen de komende 2 uur"
            else:
                eerste = next((r for r in reeks if r["mm"] >= 0.1), None)
                if eerste:
                    samenvatting = f"Regen verwacht rond {eerste['tijd']}"
        return {"nu": nu, "reeks": reeks, "samenvatting": samenvatting}

    async def _knmi(self) -> dict:
        try:
            tekst = await _get(self.session, self.bronnen["knmi"], soort="text")
        except Exception as err:  # noqa: BLE001
            raise UpdateFailed(f"KNMI-waarschuwingen niet beschikbaar: {err}") from err
        import xml.etree.ElementTree as ET  # noqa: PLC0415

        root = ET.fromstring(tekst)
        provincie = self.conf["provincie"].lower()
        nu = dt_util.utcnow()
        kleuren = {"minor": "groen", "moderate": "geel", "severe": "oranje", "extreme": "rood"}
        rang = {"geen": 0, "groen": 0, "geel": 1, "oranje": 2, "rood": 3}
        lijst = []
        for entry in root.iter():
            if entry.tag.split("}")[-1] != "entry":
                continue
            velden = {k.tag.split("}")[-1].lower(): (k.text or "").strip() for k in entry}
            gebied = velden.get("areadesc", "")
            if provincie and provincie not in gebied.lower() and "nederland" not in gebied.lower():
                continue
            verloopt = velden.get("expires", "")
            try:
                if verloopt and datetime.fromisoformat(verloopt.replace("Z", "+00:00")) < nu:
                    continue
            except ValueError:
                pass
            ernst = velden.get("severity", "").lower()
            niveau = velden.get("awareness_level", "")
            kleur = kleuren.get(ernst, "geel")
            for naam, k in (("yellow", "geel"), ("orange", "oranje"), ("red", "rood"), ("green", "groen")):
                if naam in niveau.lower():
                    kleur = k
            if kleur == "groen":
                continue
            soort = velden.get("event") or velden.get("awareness_type", "").split(";")[-1].strip() or velden.get("title", "")
            lijst.append(
                {
                    "kleur": kleur,
                    "soort": soort,
                    "gebied": gebied,
                    "vanaf": velden.get("effective") or velden.get("onset", ""),
                    "tot": verloopt,
                    "titel": velden.get("title", ""),
                }
            )
        lijst.sort(key=lambda w: -rang[w["kleur"]])
        hoogste = lijst[0]["kleur"] if lijst else "geen"
        onweer = any("onweer" in w["soort"].lower() or "thunder" in w["soort"].lower() for w in lijst)
        return {"code": hoogste, "waarschuwingen": lijst, "onweer": onweer}

    async def _vliegtuigen(self) -> dict:
        straal_nm = max(1, round(self.conf["vliegtuig_straal_km"] / 1.852))
        bronnen = self.bronnen["vliegtuigen"]
        if isinstance(bronnen, str):
            bronnen = [bronnen]
        data = None
        fout = None
        for basis in bronnen:
            try:
                data = await _get(self.session, f"{basis}/{self.lat:.4f}/{self.lon:.4f}/{straal_nm}")
                break
            except Exception as err:  # noqa: BLE001
                fout = err
        if data is None:
            raise UpdateFailed(f"Vliegtuigdata niet beschikbaar: {fout}")
        lijst = []
        for ac in data.get("ac", []) or data.get("aircraft", []):
            if ac.get("lat") is None or ac.get("lon") is None:
                continue
            hoogte = ac.get("alt_baro")
            if hoogte == "ground":
                continue
            hoogte_m = round(hoogte * 0.3048) if isinstance(hoogte, (int, float)) else None
            snelheid = ac.get("gs")
            lijst.append(
                {
                    "id": ac.get("hex"),
                    "naam": (ac.get("flight") or ac.get("r") or ac.get("hex") or "").strip(),
                    "type": ac.get("t") or "",
                    "reg": ac.get("r") or "",
                    "lat": ac["lat"],
                    "lon": ac["lon"],
                    "hoogte_m": hoogte_m,
                    "kmh": round(snelheid * 1.852) if isinstance(snelheid, (int, float)) else None,
                    "koers": ac.get("track") or ac.get("true_heading") or 0,
                    "afstand_km": round(_afstand_km(self.lat, self.lon, ac["lat"], ac["lon"]), 1),
                    "helikopter": str(ac.get("t", "")).upper() in HELI_TYPES or ac.get("category") == "A7",
                }
            )
        lijst.sort(key=lambda a: a["afstand_km"])
        return {"lijst": lijst[:60]}

    # ---------- Afval ----------

    def afval(self) -> dict:
        vandaag = dt_util.now().date()
        ophaal = []
        for soort, datums in self.conf.get("afval", {}).items():
            for d in datums:
                try:
                    dag = date.fromisoformat(str(d))
                except ValueError:
                    continue
                if dag >= vandaag:
                    ophaal.append({"soort": soort, "datum": dag.isoformat(), "dagen": (dag - vandaag).days})
        ophaal.sort(key=lambda o: o["datum"])
        return {"volgende": ophaal[0] if ophaal else None, "lijst": ophaal[:8]}


# Veelvoorkomende helikoptertypes (traumaheli, politie, defensie)
HELI_TYPES = {"EC35", "EC45", "EC30", "EC55", "H135", "H145", "AS65", "A139", "AW139", "NH90", "CH47", "H47", "AH64", "B06", "R44", "R22", "EC20", "AS50", "A109", "A169", "B429"}


class P2000Coordinator(DataUpdateCoordinator):
    """Haalt P2000-meldingen op en geeft een seintje bij nieuwe meldingen."""

    def __init__(self, hub: MeldkamerHub) -> None:
        super().__init__(
            hub.hass,
            _LOGGER,
            config_entry=None,
            name="meldkamer_p2000",
            update_interval=timedelta(seconds=max(10, hub.conf["p2000_interval"])),
        )
        self.hub = hub
        self.store = Store(hub.hass, 1, f"{DOMAIN}.p2000")
        self.gezien: list[str] = []
        self.meldingen: list[dict] = []
        self.tijdstippen: list[str] = []
        self.bron = None
        self.eerste_keer = True
        self.laatste_fout: str | None = None

    async def async_laad(self) -> None:
        opgeslagen = await self.store.async_load() or {}
        self.gezien = opgeslagen.get("gezien", [])
        self.meldingen = opgeslagen.get("meldingen", [])
        self.tijdstippen = opgeslagen.get("tijdstippen", [])
        self.eerste_keer = not self.gezien
        self.data = self._samenvatting()

    @callback
    def _bewaar(self) -> None:
        self.store.async_delay_save(
            lambda: {
                "gezien": self.gezien[-MAX_GEZIEN:],
                "meldingen": self.meldingen[:MAX_MELDINGEN],
                "tijdstippen": self.tijdstippen,
            },
            5,
        )

    def _samenvatting(self) -> dict:
        nu = dt_util.now()
        begin_dag = nu.replace(hour=0, minute=0, second=0, microsecond=0)
        begin_week = begin_dag - timedelta(days=nu.weekday())
        tijden = []
        for t in self.tijdstippen:
            try:
                tijden.append(dt_util.as_local(datetime.fromisoformat(t)))
            except ValueError:
                continue
        return {
            "meldingen": self.meldingen[:MAX_MELDINGEN],
            "vandaag": sum(1 for t in tijden if t >= begin_dag),
            "week": sum(1 for t in tijden if t >= begin_week),
            "bron": self.bron,
            "fout": self.laatste_fout,
        }

    async def _haal_feed(self) -> list[dict]:
        bronnen = self.hub.bronnen["p2000"]
        if isinstance(bronnen, str):
            bronnen = [bronnen]
        # Begin met de bron die de vorige keer werkte.
        if self.bron in bronnen:
            bronnen = [self.bron] + [b for b in bronnen if b != self.bron]
        fouten = []
        for url in bronnen:
            try:
                tekst = await _get(self.hub.session, url, soort="text")
                items = p2000.lees_feed(tekst)
                self.bron = url
                return items
            except Exception as err:  # noqa: BLE001
                fouten.append(f"{url}: {err}")
        raise UpdateFailed("Geen enkele P2000-bron werkt: " + " | ".join(fouten))

    async def _async_update_data(self) -> dict:
        try:
            items = await self._haal_feed()
            self.laatste_fout = None
        except UpdateFailed as err:
            self.laatste_fout = str(err)
            raise
        conf = self.hub.conf
        nieuw = []
        gezien = set(self.gezien)
        for item in items:
            if item["id"] in gezien:
                continue
            gezien.add(item["id"])
            self.gezien.append(item["id"])
            tekst = item["titel"] + " " + " ".join(item["eenheden"])
            eigen = p2000.bevat_een(tekst, conf["eigen_eenheden"])
            relevant = eigen or p2000.bevat_een(tekst, conf["filter"])
            if not relevant and not conf["toon_alles"]:
                continue
            nieuw.append({**item, "eigen": eigen, "relevant": relevant})

        # Oudste eerst verwerken, zodat de nieuwste bovenaan komt.
        nieuw.sort(key=lambda m: m["tijd"])
        for melding in nieuw:
            await self._verrijk(melding)
            self.meldingen.insert(0, melding)
            self.tijdstippen.append(melding["tijd"])
            # Bij de allereerste keer laden geen alarm geven voor oude meldingen.
            if not self.eerste_keer:
                self.hass.bus.async_fire(EVENT_MELDING, melding)
        self.meldingen.sort(key=lambda m: m["tijd"], reverse=True)
        del self.meldingen[MAX_MELDINGEN:]
        grens = (dt_util.utcnow() - timedelta(days=8)).isoformat()
        self.tijdstippen = [t for t in self.tijdstippen if t >= grens]
        self.eerste_keer = False
        if nieuw:
            self._bewaar()
        return self._samenvatting()

    async def _verrijk(self, melding: dict) -> None:
        titel = melding["titel"]
        melding["prio"] = p2000.prioriteit(titel)
        melding["kort"] = p2000.korte_titel(titel)
        plaats_voorkeur = next(
            (w for w in self.hub.conf["filter"] if w.lower() in titel.lower()), self.hub.conf["plaats"]
        )
        locatie = await self.hub.geocode(p2000.adres_zoektekst(titel), plaats_voorkeur)
        if locatie and _afstand_km(self.hub.lat, self.hub.lon, locatie["lat"], locatie["lon"]) < 150:
            melding["lat"] = locatie["lat"]
            melding["lon"] = locatie["lon"]
            melding["adres"] = locatie["naam"]
            melding["plaats"] = locatie["plaats"]
            melding["route"] = await self.hub.routes_naar(locatie["lat"], locatie["lon"])
        else:
            melding["route"] = None

    async def async_test_melding(self, tekst: str | None) -> None:
        """Maak een nepmelding om het alarm te testen."""
        plaats = self.hub.conf["plaats"]
        eenheden = [f"Brandweer TEST ({e})" for e in self.hub.conf["eigen_eenheden"][:1]] or ["Brandweer TEST"]
        melding = {
            "id": f"test-{dt_util.utcnow().timestamp()}",
            "titel": tekst or f"P 1 TEST Gebouwbrand Stationsplein {plaats}",
            "eenheden": eenheden,
            "tijd": dt_util.utcnow().isoformat(),
            "link": "",
            "eigen": True,
            "relevant": True,
            "test": True,
        }
        await self._verrijk(melding)
        self.meldingen.insert(0, melding)
        del self.meldingen[MAX_MELDINGEN:]
        self.hass.bus.async_fire(EVENT_MELDING, melding)
        self.async_set_updated_data(self._samenvatting())
