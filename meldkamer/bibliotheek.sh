#!/usr/bin/env bash
# =============================================================
#  Offline bibliotheek (Kiwix) en offline kaart van Nederland
#  Draait 's nachts (01:30-07:30) via een systemd-timer en gaat
#  elke nacht verder waar hij gebleven was.
#  Handmatig starten:  bibliotheek-nu
# =============================================================
set -uo pipefail

BIB="${BIB:-$HOME/bibliotheek}"
CONFIG="${CONFIG:-$HOME/meldkamer-config}"
EIGENAAR="${EIGENAAR:-}"
ZIM="$BIB/zim"
KEUZE="$BIB/keuze.txt"
STATUS_TSV="$BIB/status.tsv"
STATUS_JSON="$CONFIG/www/bibliotheek/status.json"
KAART="$CONFIG/www/kaartdata"
BASIS="${BASIS:-https://download.kiwix.org/zim}"
KIWIX_IMAGE="ghcr.io/kiwix/kiwix-serve:3.7.0"
PROXY_IMAGE="caddy:2.8.4-alpine"
MARGE=$((15 * 1024 * 1024 * 1024))   # altijd 15 GB vrij laten

mkdir -p "$ZIM" "$(dirname "$STATUS_JSON")" "$KAART"
touch "$STATUS_TSV"
log() { echo "[$(date '+%F %T')] $*"; }

# ---------- status bijhouden ----------
# kolommen: id  naam  categorie  status  bestand  grootte  gedaan
zet_status() {
  local id="$1"
  grep -v "^${id}	" "$STATUS_TSV" > "$STATUS_TSV.tmp" 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$@" >> "$STATUS_TSV.tmp"
  mv "$STATUS_TSV.tmp" "$STATUS_TSV"
  schrijf_json
}

schrijf_json() {
  python3 - "$STATUS_TSV" "$STATUS_JSON" "$KEUZE" "$ZIM" "$KAART" <<'EOP'
import json, os, shutil, sys, time
tsv, uit, keuze, zim, kaart = sys.argv[1:6]
rijen = {}
for r in open(tsv, encoding="utf-8"):
    d = r.rstrip("\n").split("\t")
    if len(d) >= 7:
        rijen[d[0]] = d
items = []
if os.path.exists(keuze):
    for r in open(keuze, encoding="utf-8"):
        r = r.strip()
        if not r or r.startswith("#"):
            continue
        d = r.split("|")
        if len(d) < 4:
            continue
        pid = d[1]
        s = rijen.get(pid)
        items.append({
            "id": pid, "naam": d[2], "categorie": d[3],
            "status": s[3] if s else "wacht",
            "bestand": s[4] if s else "",
            "grootte": int(s[5] or 0) if s else 0,
            "gedaan": int(s[6] or 0) if s else 0,
        })
k = rijen.get("__kaart__")
du = shutil.disk_usage(zim)
data = {
    "bijgewerkt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    "items": items,
    "kaart": {"status": k[3] if k else "wacht", "grootte": int(k[5] or 0) if k else 0},
    "schijf": {"vrij": du.free, "totaal": du.total},
}
tmp = uit + ".tmp"
json.dump(data, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
os.replace(tmp, uit)
EOP
}

# ---------- Kiwix (de bibliotheek-server) ----------
start_kiwix() {
  if ! ls "$ZIM"/*.zim >/dev/null 2>&1; then return; fi
  docker rm -f bibliotheek >/dev/null 2>&1 || true
  docker run -d --name bibliotheek --restart unless-stopped -p 8090:8080 \
    -v "$ZIM":/data "$KIWIX_IMAGE" '*.zim' >/dev/null && log "Bibliotheek-server (her)start"
}

# Tussenstation op poort 8091: haalt de beveiligingsregel (Content-Security-Policy
# met 'sandbox') weg die Kiwix meestuurt, want daardoor weigert Chrome PDF's te tonen.
start_proxy() {
  cat > "$BIB/Caddyfile" <<'EOC'
:8091 {
	reverse_proxy 127.0.0.1:8090 {
		header_down -Content-Security-Policy
		header_down -X-Frame-Options
	}
}
EOC
  if docker ps --format '{{.Names}}' | grep -q '^bibliotheek-proxy$'; then
    docker restart bibliotheek-proxy >/dev/null
  else
    docker rm -f bibliotheek-proxy >/dev/null 2>&1 || true
    docker run -d --name bibliotheek-proxy --restart unless-stopped --network host \
      -v "$BIB/Caddyfile":/etc/caddy/Caddyfile:ro "$PROXY_IMAGE" >/dev/null && log "Tussenstation gestart (poort 8091)"
  fi
}

# Nieuwste versie van een boek zoeken op download.kiwix.org
zoek_nieuwste() {
  local map="$1" prefix="$2" m f
  for m in "$map" other; do
    f=$(curl -fsL --max-time 60 "$BASIS/$m/" | grep -o "href=\"${prefix}[0-9-]*\.zim\"" | sed 's/^href="//; s/"$//' | sort -V | tail -1)
    if [ -n "$f" ]; then echo "$m/$f"; return 0; fi
  done
  return 1
}

download_boek() {
  local map="$1" prefix="$2" naam="$3" cat="$4" pad bestand url grootte vrij pid
  pad=$(zoek_nieuwste "$map" "$prefix") || { zet_status "$prefix" "$naam" "$cat" "niet-gevonden" "" 0 0; log "Niet gevonden: $prefix"; return; }
  bestand=$(basename "$pad")
  url="$BASIS/$pad"
  if [ -f "$ZIM/$bestand" ]; then
    zet_status "$prefix" "$naam" "$cat" "klaar" "$bestand" "$(stat -c %s "$ZIM/$bestand")" "$(stat -c %s "$ZIM/$bestand")"
    return
  fi
  grootte=$(curl -fsIL --max-time 60 "$url" | awk 'tolower($1)=="content-length:"{v=$2} END{gsub("\r","",v); print v+0}')
  vrij=$(df --output=avail -B1 "$ZIM" | tail -1)
  local al=0
  [ -f "$ZIM/$bestand.part" ] && al=$(stat -c %s "$ZIM/$bestand.part")
  if [ "$grootte" -gt 0 ] && [ $((grootte - al + MARGE)) -gt "$vrij" ]; then
    zet_status "$prefix" "$naam" "$cat" "te-weinig-ruimte" "$bestand" "$grootte" "$al"
    log "Te weinig ruimte voor $bestand"
    return
  fi
  log "Downloaden: $bestand ($((grootte / 1024 / 1024)) MB)"
  zet_status "$prefix" "$naam" "$cat" "bezig" "$bestand" "$grootte" "$al"
  wget -q -c --tries=30 --timeout=60 --waitretry=30 -O "$ZIM/$bestand.part" "$url" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    sleep 30
    [ -f "$ZIM/$bestand.part" ] && zet_status "$prefix" "$naam" "$cat" "bezig" "$bestand" "$grootte" "$(stat -c %s "$ZIM/$bestand.part")"
  done
  if wait "$pid" && { [ "$grootte" -eq 0 ] || [ "$(stat -c %s "$ZIM/$bestand.part")" -ge "$grootte" ]; }; then
    mv "$ZIM/$bestand.part" "$ZIM/$bestand"
    # Oude versies van hetzelfde boek opruimen
    find "$ZIM" -maxdepth 1 -name "${prefix}*.zim" ! -name "$bestand" -delete
    zet_status "$prefix" "$naam" "$cat" "klaar" "$bestand" "$(stat -c %s "$ZIM/$bestand")" "$(stat -c %s "$ZIM/$bestand")"
    log "Klaar: $bestand"
    start_kiwix
  else
    zet_status "$prefix" "$naam" "$cat" "onderbroken" "$bestand" "$grootte" "$(stat -c %s "$ZIM/$bestand.part" 2>/dev/null || echo 0)"
    log "Onderbroken: $bestand (gaat de volgende nacht verder)"
  fi
}

# ---------- offline kaart van Nederland ----------
download_kaart() {
  if [ -f "$KAART/klaar" ]; then return; fi
  zet_status "__kaart__" "Kaart Nederland" "kaart" "bezig" "nederland.pmtiles" 0 0
  if ! command -v pmtiles >/dev/null; then
    local url
    url=$(curl -fsL https://api.github.com/repos/protomaps/go-pmtiles/releases/latest | grep -o 'https://[^"]*Linux_x86_64\.tar\.gz' | head -1)
    [ -n "$url" ] && curl -fsL "$url" | tar xz -C /usr/local/bin pmtiles
  fi
  if ! command -v pmtiles >/dev/null; then zet_status "__kaart__" "Kaart Nederland" "kaart" "onderbroken" "" 0 0; log "pmtiles-programma niet gevonden"; return; fi
  local sleutel
  sleutel=$(curl -fsL https://build-metadata.protomaps.dev/builds.json | grep -o '[0-9]\{8\}\.pmtiles' | sort | tail -1)
  if [ -z "$sleutel" ]; then zet_status "__kaart__" "Kaart Nederland" "kaart" "onderbroken" "" 0 0; return; fi
  log "Kaart van Nederland uitsnijden uit $sleutel"
  rm -f "$KAART/nieuw.pmtiles"
  if pmtiles extract "https://build.protomaps.com/$sleutel" "$KAART/nieuw.pmtiles" --bbox=3.2,50.7,7.3,53.6 --maxzoom=15; then
    mv "$KAART/nieuw.pmtiles" "$KAART/nederland.pmtiles"
  else
    zet_status "__kaart__" "Kaart Nederland" "kaart" "onderbroken" "" 0 0; return
  fi
  local f r
  for f in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
    mkdir -p "$KAART/fonts/$f"
    for r in 0-255 256-511 8192-8447; do
      curl -fsL "https://protomaps.github.io/basemaps-assets/fonts/${f// /%20}/$r.pbf" -o "$KAART/fonts/$f/$r.pbf" || true
    done
  done
  mkdir -p "$KAART/sprites"
  for f in light.json light.png light@2x.json light@2x.png; do
    curl -fsL "https://protomaps.github.io/basemaps-assets/sprites/v4/$f" -o "$KAART/sprites/$f" || true
  done
  date > "$KAART/klaar"
  zet_status "__kaart__" "Kaart Nederland" "kaart" "klaar" "nederland.pmtiles" "$(stat -c %s "$KAART/nederland.pmtiles")" 0
  log "Kaart klaar"
}

# ---------- alleen het tussenstation (her)starten ----------
if [ "${1:-}" = "--proxy" ]; then start_proxy; exit 0; fi

# ---------- start ----------
log "Start offline bibliotheek"
schrijf_json
[ "${ZONDER_KAART:-}" = "1" ] || download_kaart
if [ -f "$KEUZE" ]; then
  while IFS='|' read -r map prefix naam cat <&3; do
    [ -z "${map// }" ] && continue
    case "$map" in \#*) continue ;; esac
    download_boek "$map" "$prefix" "$naam" "$cat"
  done 3< <(grep -v '^[[:space:]]*$' "$KEUZE")
fi
docker ps --format '{{.Names}}' | grep -q '^bibliotheek$' || start_kiwix
start_proxy
schrijf_json
if [ -n "$EIGENAAR" ]; then chown -R "$EIGENAAR" "$BIB" "$CONFIG/www/bibliotheek" "$KAART" 2>/dev/null || true; fi
log "Klaar voor vannacht"
