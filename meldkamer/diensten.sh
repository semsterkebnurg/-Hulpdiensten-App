#!/usr/bin/env bash
# =============================================================
#  Thuisserver-diensten: startpagina, noodkaart, Pi-hole, Tailscale
#  Wordt als beheerder uitgevoerd door de automatische update.
#    diensten.sh           alles installeren / bijwerken
#    diensten.sh --status  alleen de status voor de startpagina bijwerken
# =============================================================
set -uo pipefail

GEBRUIKER="${GEBRUIKER:?}"
CODE="${CODE:?}"
CONFIG="${CONFIG:?}"
THUIS="$(getent passwd "$GEBRUIKER" | cut -d: -f6)"
START="$CONFIG/www/start"
PIHOLE_IMAGE="pihole/pihole:2024.07.0"
log() { echo "[$(date '+%F %T')] $*"; }

schrijf_status() {
  mkdir -p "$START"
  local ts_json="{}"
  command -v tailscale >/dev/null && ts_json=$(tailscale status --json 2>/dev/null || echo "{}")
  local pihole="uit"
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^pihole$' && pihole="aan"
  TS="$ts_json" PIHOLE="$pihole" LAN="$(hostname -I 2>/dev/null | awk '{print $1}')" python3 - "$START/status.json" <<'EOP'
import json, os, sys, time
try:
    ts = json.loads(os.environ.get("TS") or "{}")
except ValueError:
    ts = {}
zelf = ts.get("Self") or {}
ips = zelf.get("TailscaleIPs") or []
data = {
    "bijgewerkt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    "lan": os.environ.get("LAN", ""),
    "pihole": os.environ.get("PIHOLE", "uit"),
    "tailscale": {
        "status": ts.get("BackendState", "niet-geinstalleerd" if not ts else "onbekend"),
        "inloglink": ts.get("AuthURL", ""),
        "ip": next((i for i in ips if "." in i), ""),
        "naam": (zelf.get("DNSName") or "").rstrip("."),
    },
}
tmp = sys.argv[1] + ".tmp"
json.dump(data, open(tmp, "w"), ensure_ascii=False)
os.replace(tmp, sys.argv[1])
EOP
}

if [ "${1:-}" = "--status" ]; then
  # Nog niet ingelogd bij Tailscale en geen inloglink? Dan er een aanvragen.
  if command -v tailscale >/dev/null && tailscale status --json 2>/dev/null | grep -q '"BackendState": *"NeedsLogin"' \
     && ! tailscale status --json 2>/dev/null | grep -q '"AuthURL": *"http'; then
    timeout 20 tailscale up --accept-dns=false >/dev/null 2>&1 || true
  fi
  schrijf_status
  exit 0
fi

# ---------- startpagina ----------
log "Startpagina bijwerken"
mkdir -p "$START"
cp -r "$CODE/meldkamer/start/." "$START/"
BIB="$THUIS/bibliotheek" CONFIG="$CONFIG" /usr/local/bin/meldkamer-bibliotheek --proxy || true
[ -f "$CONFIG/www/kaartdata/nood.geojson" ] || BIB="$THUIS/bibliotheek" CONFIG="$CONFIG" /usr/local/bin/meldkamer-bibliotheek --nood || true

# ---------- Pi-hole (reclameblokker) ----------
if ! docker ps -a --format '{{.Names}}' | grep -q '^pihole$'; then
  log "Pi-hole installeren"
  # Poort 53 vrijmaken: Ubuntu's eigen DNS-hulpje luistert daar standaard
  mkdir -p /etc/systemd/resolved.conf.d
  printf '[Resolve]\nDNSStubListener=no\n' > /etc/systemd/resolved.conf.d/pihole.conf
  ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
  systemctl restart systemd-resolved || true
  mkdir -p "$THUIS/pihole/etc" "$THUIS/pihole/dnsmasq"
  docker run -d --name pihole --restart unless-stopped --network host \
    -e TZ=Europe/Amsterdam -e WEBPASSWORD="" -e WEB_PORT=8081 -e DNSMASQ_LISTENING=all \
    -e PIHOLE_DNS_="1.1.1.1;9.9.9.9" \
    -v "$THUIS/pihole/etc":/etc/pihole -v "$THUIS/pihole/dnsmasq":/etc/dnsmasq.d \
    "$PIHOLE_IMAGE" >/dev/null && log "Pi-hole draait (beheer: poort 8081)"
fi

# ---------- Tailscale (overal bij je server) ----------
if ! command -v tailscale >/dev/null; then
  log "Tailscale installeren"
  curl -fsSL https://tailscale.com/install.sh | sh >/dev/null 2>&1 || log "Tailscale installeren mislukt"
fi
if command -v tailscale >/dev/null; then
  systemctl enable --now tailscaled >/dev/null 2>&1 || true
  if tailscale status --json 2>/dev/null | grep -q '"BackendState": *"NeedsLogin"'; then
    timeout 20 tailscale up --accept-dns=false >/dev/null 2>&1 || true
  fi
fi

schrijf_status
log "Diensten klaar"
