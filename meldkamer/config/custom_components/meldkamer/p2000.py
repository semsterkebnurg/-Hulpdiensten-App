"""Hulpfuncties om P2000-meldingen uit een RSS/Atom-feed te lezen."""

from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import hashlib
import html
import re
import xml.etree.ElementTree as ET

RE_PRIO = re.compile(r"\b(?:P|A|PRIO)\s?([123])\b", re.IGNORECASE)
RE_CODE = re.compile(r"\b[A-Z]{2,4}-\d{1,3}\b")  # bijv. BDH-01, BRT-02
RE_CAPCODE = re.compile(r"\b\d{6,7}\b")
RE_TAG = re.compile(r"<[^>]+>")
RE_BR = re.compile(r"<br\s*/?>|\n|\r", re.IGNORECASE)
RE_POSTCODE = re.compile(r"\b\d{4}\s?[A-Z]{2}\b")

# Woorden die vaak in meldingen staan maar geen deel van het adres zijn.
STOPWOORDEN = {
    "prio", "ambu", "rit", "brandweer", "test", "proefalarm", "dia", "ja", "nee",
}


def _tekst(el: ET.Element | None) -> str:
    if el is None:
        return ""
    return "".join(el.itertext()).strip()


def _zoek(item: ET.Element, *namen: str) -> ET.Element | None:
    """Zoek een kind-element op naam, ongeacht namespace."""
    for kind in item:
        tag = kind.tag.split("}")[-1].lower()
        if tag in namen:
            return kind
    return None


def _datum(waarde: str) -> datetime:
    waarde = waarde.strip()
    if waarde:
        try:
            d = parsedate_to_datetime(waarde)
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return d
        except (TypeError, ValueError):
            pass
        try:
            d = datetime.fromisoformat(waarde.replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return d
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def lees_feed(xml_tekst: str) -> list[dict]:
    """Zet de tekst van een RSS- of Atom-feed om in een lijst meldingen."""
    root = ET.fromstring(xml_tekst)
    items = [
        el for el in root.iter() if el.tag.split("}")[-1].lower() in ("item", "entry")
    ]
    meldingen = []
    for item in items:
        titel = html.unescape(_tekst(_zoek(item, "title")))
        omschrijving_ruw = html.unescape(
            _tekst(_zoek(item, "description", "summary", "content"))
        )
        regels = [
            RE_TAG.sub("", r).strip() for r in RE_BR.split(omschrijving_ruw)
        ]
        regels = [r for r in regels if r and r != titel]
        datum = _datum(
            _tekst(_zoek(item, "pubdate", "updated", "published", "date"))
        )
        link_el = _zoek(item, "link")
        link = ""
        if link_el is not None:
            link = link_el.get("href") or _tekst(link_el)
        guid = _tekst(_zoek(item, "guid", "id")) or link
        if not guid:
            guid = hashlib.sha1(
                f"{titel}|{datum.isoformat()}".encode()
            ).hexdigest()
        meldingen.append(
            {
                "id": guid,
                "titel": titel,
                "eenheden": regels,
                "tijd": datum.isoformat(),
                "link": link,
            }
        )
    return meldingen


def prioriteit(tekst: str) -> int | None:
    m = RE_PRIO.search(tekst)
    return int(m.group(1)) if m else None


def adres_zoektekst(titel: str) -> str:
    """Maak van een meldingstekst een zoektekst voor de adres-zoeker."""
    t = RE_PRIO.sub(" ", titel)
    t = RE_CODE.sub(" ", t)
    t = RE_CAPCODE.sub(" ", t)
    woorden = [
        w for w in re.split(r"[\s,:;()]+", t) if w and w.lower() not in STOPWOORDEN
    ]
    return " ".join(woorden).strip()


def korte_titel(titel: str) -> str:
    """Titel zonder prioriteit, codes en capcodes."""
    t = RE_PRIO.sub(" ", titel)
    t = RE_CODE.sub(" ", t)
    t = RE_CAPCODE.sub(" ", t)
    return re.sub(r"\s+", " ", t).strip(" -:")


def bevat_een(tekst: str, woorden: list[str]) -> bool:
    laag = tekst.lower()
    return any(w.lower() in laag for w in woorden if w)
