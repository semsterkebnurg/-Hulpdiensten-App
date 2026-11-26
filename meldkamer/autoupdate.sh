#!/usr/bin/env bash
# =============================================================
#  Automatische update van het dashboard (draait elke 10 minuten)
#  Kijkt of er een nieuwe versie op GitHub staat en zet die klaar.
#  Home Assistant wordt alleen herstart als dat echt nodig is.
# =============================================================
set -uo pipefail

GEBRUIKER="${GEBRUIKER:?}"
CODE="${CODE:?}"
CONFIG="${CONFIG:?}"
BRANCH="${BRANCH:?}"
als_gebruiker() { sudo -u "$GEBRUIKER" -H "$@"; }
log() { echo "[$(date '+%F %T')] $*"; }

als_gebruiker git -C "$CODE" fetch -q origin "$BRANCH" || { log "Geen verbinding met GitHub"; exit 0; }
oud=$(als_gebruiker git -C "$CODE" rev-parse HEAD)
nieuw=$(als_gebruiker git -C "$CODE" rev-parse "origin/$BRANCH")
if [ "$oud" = "$nieuw" ]; then
  # Niets nieuws: alleen de status van de startpagina bijwerken
  if [ -f "$CODE/meldkamer/diensten.sh" ]; then
    if [ ! -f "$CONFIG/www/start/index.html" ]; then
      # Eerste keer: de diensten nog installeren
      GEBRUIKER="$GEBRUIKER" CODE="$CODE" CONFIG="$CONFIG" bash "$CODE/meldkamer/diensten.sh" || log "Diensten: er ging iets mis"
    else
      GEBRUIKER="$GEBRUIKER" CODE="$CODE" CONFIG="$CONFIG" bash "$CODE/meldkamer/diensten.sh" --status >/dev/null 2>&1
    fi
  fi
  exit 0
fi

log "Nieuwe versie gevonden: ${nieuw:0:7}"
gewijzigd=$(als_gebruiker git -C "$CODE" diff --name-only "$oud" "$nieuw")
als_gebruiker git -C "$CODE" reset -q --hard "origin/$BRANCH"

BRON="$CODE/meldkamer/config"
rm -rf "$CONFIG/custom_components/meldkamer" "$CONFIG/www/meldkamer" "$CONFIG/blueprints/automation/meldkamer"
mkdir -p "$CONFIG/custom_components" "$CONFIG/www" "$CONFIG/blueprints/automation" "$CONFIG/packages"
cp -r "$BRON/custom_components/meldkamer" "$CONFIG/custom_components/"
cp -r "$BRON/www/meldkamer" "$CONFIG/www/"
cp -r "$BRON/blueprints/automation/meldkamer" "$CONFIG/blueprints/automation/"
cp "$BRON/packages/meldkamer.yaml" "$CONFIG/packages/"
cp "$BRON/configuration.yaml" "$CONFIG/configuration.yaml"
sed -i "s|meldkamer-panel.js?v=1|meldkamer-panel.js?v=$(date +%s)|" "$CONFIG/configuration.yaml"
install -m 755 "$CODE/meldkamer/bibliotheek.sh" /usr/local/bin/meldkamer-bibliotheek
install -m 755 "$CODE/meldkamer/autoupdate.sh" /usr/local/bin/meldkamer-autoupdate
echo "$nieuw" > "$CONFIG/www/meldkamer/versie.txt"
chown -R "$(id -u "$GEBRUIKER"):$(id -g "$GEBRUIKER")" "$CONFIG"

# Alleen herstarten als de koppeling of instellingen veranderd zijn (niet bij alleen het uiterlijk)
if echo "$gewijzigd" | grep -qE '^meldkamer/config/(custom_components|packages|blueprints|configuration\.yaml)'; then
  log "Home Assistant herstarten"
  docker restart homeassistant >/dev/null
fi
if echo "$gewijzigd" | grep -q '^meldkamer/bibliotheek.sh'; then
  BIB="/home/$GEBRUIKER/bibliotheek" CONFIG="$CONFIG" /usr/local/bin/meldkamer-bibliotheek --proxy || true
fi
if echo "$gewijzigd" | grep -qE '^meldkamer/(diensten\.sh|start/)'; then
  GEBRUIKER="$GEBRUIKER" CODE="$CODE" CONFIG="$CONFIG" bash "$CODE/meldkamer/diensten.sh" || log "Diensten: er ging iets mis"
fi
log "Bijgewerkt naar ${nieuw:0:7}"
