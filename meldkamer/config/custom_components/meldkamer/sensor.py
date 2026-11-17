"""Sensoren voor het Meldkamer-dashboard."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from datetime import timedelta

from .const import DOMAIN


async def async_setup_platform(
    hass: HomeAssistant, config: dict, async_add_entities: AddEntitiesCallback, discovery_info=None
) -> None:
    if discovery_info is None:
        return
    hub = hass.data[DOMAIN]
    async_add_entities(
        [
            LaatsteMeldingSensor(hub),
            MeldingenTellerSensor(hub, "vandaag", "Brandmeldingen vandaag"),
            MeldingenTellerSensor(hub, "week", "Brandmeldingen deze week"),
            WeerSensor(hub),
            LuchtSensor(hub),
            RegenSensor(hub),
            KnmiSensor(hub),
            VliegtuigSensor(hub),
            AfvalSensor(hub),
            NieuwsSensor(hub),
            InstellingenSensor(hub),
        ]
    )


class _Basis(CoordinatorEntity, SensorEntity):
    _attr_should_poll = False

    def __init__(self, coordinator, sleutel: str, naam: str, icoon: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{DOMAIN}_{sleutel}"
        self._attr_name = naam
        self._attr_icon = icoon
        self.entity_id = f"sensor.{DOMAIN}_{sleutel}"

    @property
    def available(self) -> bool:
        return self.coordinator.data is not None


class LaatsteMeldingSensor(_Basis):
    def __init__(self, hub) -> None:
        super().__init__(hub.p2000, "laatste_melding", "Laatste brandmelding", "mdi:fire-truck")

    @property
    def native_value(self) -> str | None:
        meldingen = (self.coordinator.data or {}).get("meldingen") or []
        echte = [m for m in meldingen if not m.get("proef")]
        return echte[0]["titel"][:250] if echte else "Geen meldingen"

    @property
    def available(self) -> bool:
        return True

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.coordinator.data or {}
        meldingen = data.get("meldingen") or []
        echte = [m for m in meldingen if not m.get("proef")]
        return {
            "melding": echte[0] if echte else None,
            **data,
        }


class MeldingenTellerSensor(_Basis):
    _attr_native_unit_of_measurement = "meldingen"

    def __init__(self, hub, periode: str, naam: str) -> None:
        super().__init__(hub.p2000, f"meldingen_{periode}", naam, "mdi:counter")
        self.periode = periode

    @property
    def native_value(self) -> int:
        return (self.coordinator.data or {}).get(self.periode, 0)

    @property
    def available(self) -> bool:
        return True


class WeerSensor(_Basis):
    _attr_native_unit_of_measurement = "°C"
    _attr_device_class = "temperature"

    def __init__(self, hub) -> None:
        super().__init__(hub.weer, "weer", "Weer buiten", "mdi:weather-partly-cloudy")

    @property
    def native_value(self):
        return (self.coordinator.data or {}).get("nu", {}).get("temperature_2m")

    @property
    def extra_state_attributes(self):
        return self.coordinator.data or {}


class LuchtSensor(_Basis):
    _attr_native_unit_of_measurement = "EAQI"

    def __init__(self, hub) -> None:
        super().__init__(hub.lucht, "luchtkwaliteit", "Luchtkwaliteit", "mdi:air-filter")

    @property
    def native_value(self):
        return (self.coordinator.data or {}).get("european_aqi")

    @property
    def extra_state_attributes(self):
        return self.coordinator.data or {}


class RegenSensor(_Basis):
    _attr_native_unit_of_measurement = "mm/u"

    def __init__(self, hub) -> None:
        super().__init__(hub.regen, "buienradar", "Buienradar", "mdi:weather-pouring")

    @property
    def native_value(self):
        return (self.coordinator.data or {}).get("nu")

    @property
    def extra_state_attributes(self):
        return self.coordinator.data or {}


class KnmiSensor(_Basis):
    def __init__(self, hub) -> None:
        super().__init__(hub.knmi, "knmi", "KNMI waarschuwing", "mdi:alert")

    @property
    def native_value(self):
        return (self.coordinator.data or {}).get("code", "geen")

    @property
    def extra_state_attributes(self):
        return self.coordinator.data or {}


class VliegtuigSensor(_Basis):
    _attr_native_unit_of_measurement = "vliegtuigen"

    def __init__(self, hub) -> None:
        super().__init__(hub.vliegtuigen, "vliegtuigen", "Vliegtuigen in de buurt", "mdi:airplane")

    @property
    def native_value(self):
        return len((self.coordinator.data or {}).get("lijst", []))

    @property
    def extra_state_attributes(self):
        return self.coordinator.data or {}


class NieuwsSensor(_Basis):
    def __init__(self, hub) -> None:
        super().__init__(hub.nieuws, "nieuws", "Nieuws", "mdi:newspaper")

    @property
    def native_value(self):
        items = (self.coordinator.data or {}).get("items") or []
        return items[0]["titel"][:250] if items else None

    @property
    def extra_state_attributes(self):
        return self.coordinator.data or {}


class AfvalSensor(SensorEntity):
    """Volgende afvalophaaldag, ververst elk uur."""

    _attr_should_poll = False
    _attr_icon = "mdi:trash-can"
    _attr_name = "Afval"
    _attr_unique_id = f"{DOMAIN}_afval"

    def __init__(self, hub) -> None:
        self.hub = hub
        self.entity_id = f"sensor.{DOMAIN}_afval"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_track_time_interval(self.hass, lambda _: self.async_write_ha_state(), timedelta(hours=1))
        )

    @property
    def native_value(self):
        volgende = self.hub.afval()["volgende"]
        return volgende["soort"] if volgende else "Geen datums"

    @property
    def extra_state_attributes(self):
        return self.hub.afval()


class InstellingenSensor(SensorEntity):
    """Geeft de instellingen door aan het dashboard (locatie, plaats, webcam)."""

    _attr_should_poll = False
    _attr_icon = "mdi:cog"
    _attr_name = "Meldkamer instellingen"
    _attr_unique_id = f"{DOMAIN}_instellingen"

    def __init__(self, hub) -> None:
        self.hub = hub
        self.entity_id = f"sensor.{DOMAIN}_instellingen"

    @property
    def native_value(self):
        return self.hub.conf["plaats"]

    @property
    def extra_state_attributes(self):
        return {
            "plaats": self.hub.conf["plaats"],
            "lat": self.hub.lat,
            "lon": self.hub.lon,
            "webcam": self.hub.conf["webcam"],
            "routepunten": self.hub.routepunten,
            "vliegtuig_straal_km": self.hub.conf["vliegtuig_straal_km"],
            "hoofdlamp": self.hub.conf["hoofdlamp"],
            "dashboard_lampen": self.hub.conf["dashboard_lampen"],
            "hoofdrolluik": self.hub.conf["hoofdrolluik"],
            "regio_woorden": self.hub.conf["regio_woorden"],
        }
