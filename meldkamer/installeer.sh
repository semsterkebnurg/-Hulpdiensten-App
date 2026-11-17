#!/usr/bin/env bash
# =============================================================
#  Meldkamer-dashboard installeren op een (oude) laptop
#  Werkt op Xubuntu / Ubuntu 24.04.
#  Je kunt dit script later opnieuw draaien om bij te werken:
#  je eigen instellingen blijven dan bewaard.
# =============================================================
set -euo pipefail

REPO="https://github.com/semsterkebnurg/-Hulpdiensten-App.git"
BRANCH="${MELDKAMER_BRANCH:-claude/capabilities-overview-qws35m}"
CODE="$HOME/hulpdiensten-app"
CONFIG="$HOME/meldkamer-config"
HA_IMAGE="ghcr.io/home-assistant/home-assistant:stable"

rood=$'\e[1;31m'; groen=$'\e[1;32m'; geel=$'\e[1;33m'; vet=$'\e[1m'; uit=$'\e[0m'
stap() { echo; echo "${rood}🚒  $*${uit}"; }
ok()   { echo "${groen}✔  $*${uit}"; }
let_op() { echo "${geel}!  $*${uit}"; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Start dit script als je gewone gebruiker, niet met sudo."
  exit 1
fi

clear || true
cat <<EOF
${rood}
   ███╗   ███╗███████╗██╗     ██████╗ ██╗  ██╗ █████╗ ███╗   ███╗███████╗██████╗
   ████╗ ████║██╔════╝██║     ██╔══██╗██║ ██╔╝██╔══██╗████╗ ████║██╔════╝██╔══██╗
   ██╔████╔██║█████╗  ██║     ██║  ██║█████╔╝ ███████║██╔████╔██║█████╗  ██████╔╝
   ██║╚██╔╝██║██╔══╝  ██║     ██║  ██║██╔═██╗ ██╔══██║██║╚██╔╝██║██╔══╝  ██╔══██╗
   ██║ ╚═╝ ██║███████╗███████╗██████╔╝██║  ██╗██║  ██║██║ ╚═╝ ██║███████╗██║  ██║
   ╚═╝     ╚═╝╚══════╝╚══════╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝
${uit}
   Dit script zet Home Assistant en het Meldkamer-dashboard op deze laptop.
   Het duurt ongeveer 10 tot 20 minuten. Laat de laptop aan de lader.

EOF

echo "Je wordt zo om je wachtwoord gevraagd (hetzelfde als bij het inloggen)."
echo "Tijdens het typen zie je geen tekens, dat is normaal."
sudo -v

# ---------------------------------------------------------------
stap "Stap 1 van 6: Je gegevens"
# ---------------------------------------------------------------
if [ -f "$CONFIG/meldkamer_instellingen.yaml" ]; then
  ok "Instellingen gevonden, die blijven bewaard."
  NIEUW=0
else
  NIEUW=1
  echo "Je adres wordt alleen op deze laptop bewaard. Het is nodig om rijtijden te berekenen."
  read -r -p "${vet}Je adres (bijv. Secretaris Mulderweg 12, Nunspeet): ${uit}" ADRES </dev/tty
  read -r -p "${vet}Je woonplaats [Nunspeet]: ${uit}" PLAATS </dev/tty
  PLAATS="${PLAATS:-Nunspeet}"
  read -r -p "${vet}Roepnummer van 'jouw' brandweerauto [06-1641]: ${uit}" VOERTUIG </dev/tty
  VOERTUIG="${VOERTUIG:-06-1641}"
fi

# ---------------------------------------------------------------
stap "Stap 2 van 6: Programma's installeren"
# ---------------------------------------------------------------
sudo apt-get -o DPkg::Lock::Timeout=900 update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=900 install -y -qq docker.io git curl wget x11-xserver-utils python3 >/dev/null
sudo systemctl enable --now docker >/dev/null
if ! command -v google-chrome >/dev/null; then
  wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=900 install -y -qq /tmp/chrome.deb >/dev/null
  rm -f /tmp/chrome.deb
fi
ok "Docker, Git en Google Chrome staan erop."

# ---------------------------------------------------------------
stap "Stap 3 van 6: Dashboard ophalen"
# ---------------------------------------------------------------
if [ -d "$CODE/.git" ]; then
  git -C "$CODE" fetch -q origin "$BRANCH"
  git -C "$CODE" checkout -q "$BRANCH"
  git -C "$CODE" reset -q --hard "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO" "$CODE"
fi
mkdir -p "$CONFIG"
# Home Assistant maakt bestanden aan als beheerder; maak alles weer van jou.
sudo chown -R "$(id -u):$(id -g)" "$CONFIG"
BRON="$CODE/meldkamer/config"
# Deze onderdelen worden altijd bijgewerkt:
sudo rm -rf "$CONFIG/custom_components/meldkamer" "$CONFIG/www/meldkamer" "$CONFIG/blueprints/automation/meldkamer"
mkdir -p "$CONFIG/custom_components" "$CONFIG/www" "$CONFIG/blueprints/automation" "$CONFIG/packages" "$CONFIG/themes"
cp -r "$BRON/custom_components/meldkamer" "$CONFIG/custom_components/"
cp -r "$BRON/www/meldkamer" "$CONFIG/www/"
cp -r "$BRON/blueprints/automation/meldkamer" "$CONFIG/blueprints/automation/"
cp "$BRON/packages/meldkamer.yaml" "$CONFIG/packages/"
cp "$BRON/configuration.yaml" "$CONFIG/configuration.yaml"
# Nieuwe versie van het dashboard altijd laden (geen oude kopie uit de browser)
sed -i "s|meldkamer-panel.js?v=1|meldkamer-panel.js?v=$(date +%s)|" "$CONFIG/configuration.yaml"
[ -f "$CONFIG/automations.yaml" ] || echo "[]" > "$CONFIG/automations.yaml"
[ -f "$CONFIG/scenes.yaml" ] || echo "[]" > "$CONFIG/scenes.yaml"
[ -f "$CONFIG/scripts.yaml" ] || echo "{}" > "$CONFIG/scripts.yaml"

if [ "$NIEUW" = "1" ]; then
  # Woorden waarop gefilterd wordt: de plaats en dorpen eromheen
  FILTER="$PLAATS"
  if [ "$PLAATS" = "Nunspeet" ]; then FILTER="Nunspeet, Elspeet, Vierhouten, Hulshorst"; fi
  ADRES="$ADRES" PLAATS="$PLAATS" FILTER="$FILTER" VOERTUIG="$VOERTUIG" python3 - \
    "$CODE/meldkamer/meldkamer_instellingen.voorbeeld.yaml" "$CONFIG/meldkamer_instellingen.yaml" <<'EOP'
import os, sys
tekst = open(sys.argv[1], encoding="utf-8").read()
schoon = lambda w: w.replace('"', "").replace("\\", "").strip()
v = schoon(os.environ["VOERTUIG"])
for sleutel, waarde in {
    "__ADRES__": schoon(os.environ["ADRES"]),
    "__PLAATS__": schoon(os.environ["PLAATS"]),
    "__FILTER__": ", ".join(schoon(w) for w in os.environ["FILTER"].split(",")),
    "__VOERTUIG2__": v.replace("-", ""),
    "__VOERTUIG3__": v.replace("-", " "),
    "__VOERTUIG__": v,
}.items():
    tekst = tekst.replace(sleutel, waarde)
open(sys.argv[2], "w", encoding="utf-8").write(tekst)
EOP
  ok "Je instellingen zijn opgeslagen in $CONFIG/meldkamer_instellingen.yaml"
fi
ok "Dashboard staat klaar."

# ---------------------------------------------------------------
stap "Stap 4 van 6: Home Assistant starten (eerste keer duurt dit even)"
# ---------------------------------------------------------------
sudo docker pull -q "$HA_IMAGE" >/dev/null
if sudo docker ps -a --format '{{.Names}}' | grep -q '^homeassistant$'; then
  sudo docker rm -f homeassistant >/dev/null
fi
sudo docker run -d \
  --name homeassistant \
  --restart=unless-stopped \
  --privileged \
  --network=host \
  -e TZ=Europe/Amsterdam \
  -v "$CONFIG":/config \
  -v /run/dbus:/run/dbus:ro \
  "$HA_IMAGE" >/dev/null
echo -n "Wachten tot Home Assistant klaar is"
for _ in $(seq 1 120); do
  if curl -s -o /dev/null http://localhost:8123; then break; fi
  echo -n "."; sleep 5
done
echo
ok "Home Assistant draait."

# ---------------------------------------------------------------
stap "Stap 5 van 6: Laptop altijd aan laten staan"
# ---------------------------------------------------------------
# Niet slapen, ook niet als het deksel dicht gaat
sudo mkdir -p /etc/systemd/logind.conf.d
printf '[Login]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore\nHandleLidSwitchDocked=ignore\nIdleAction=ignore\n' \
  | sudo tee /etc/systemd/logind.conf.d/meldkamer.conf >/dev/null
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true
# Xfce: scherm niet op zwart en geen slaapstand
if command -v xfconf-query >/dev/null; then
  for k in blank-on-ac blank-on-battery dpms-on-ac-off dpms-on-ac-sleep dpms-on-battery-off dpms-on-battery-sleep inactivity-on-ac inactivity-on-battery; do
    xfconf-query -c xfce4-power-manager -p "/xfce4-power-manager/$k" -n -t int -s 0 2>/dev/null || true
  done
  xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled -n -t bool -s false 2>/dev/null || true
  xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/lid-action-on-ac -n -t int -s 0 2>/dev/null || true
  xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/lid-action-on-battery -n -t int -s 0 2>/dev/null || true
fi
# Geen schermbeveiliging
mkdir -p "$HOME/.config/autostart"
for f in light-locker xfce4-screensaver xscreensaver; do
  printf '[Desktop Entry]\nHidden=true\n' > "$HOME/.config/autostart/$f.desktop"
done
ok "De laptop gaat niet meer slapen."

# ---------------------------------------------------------------
stap "Stap 6 van 6: Dashboard automatisch openen bij opstarten"
# ---------------------------------------------------------------
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/meldkamer-start.sh" <<'EOS'
#!/usr/bin/env bash
# Start het dashboard op volledig scherm zodra Home Assistant bereikbaar is.
xset s off 2>/dev/null; xset -dpms 2>/dev/null; xset s noblank 2>/dev/null
for _ in $(seq 1 120); do curl -s -o /dev/null http://localhost:8123 && break; sleep 3; done
exec google-chrome --kiosk --no-first-run --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --disable-features=Translate \
  --autoplay-policy=no-user-gesture-required --check-for-update-interval=31536000 \
  "http://localhost:8123/meldkamer?kiosk"
EOS
chmod +x "$HOME/.local/bin/meldkamer-start.sh"
cat > "$HOME/.config/autostart/meldkamer.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Meldkamer
Exec=$HOME/.local/bin/meldkamer-start.sh
X-GNOME-Autostart-enabled=true
EOF
# Handig commando om later bij te werken
sudo tee /usr/local/bin/meldkamer-bijwerken >/dev/null <<EOF
#!/usr/bin/env bash
curl -fsSL https://raw.githubusercontent.com/semsterkebnurg/-Hulpdiensten-App/$BRANCH/meldkamer/installeer.sh | bash
EOF
sudo chmod +x /usr/local/bin/meldkamer-bijwerken
# Icoon in het menu en op het bureaublad om het dashboard weer te openen
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/meldkamer.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Meldkamer
Comment=Open het Meldkamer-dashboard
Exec=$HOME/.local/bin/meldkamer-start.sh
Icon=google-chrome
Terminal=false
Categories=Utility;
EOF
BUREAUBLAD=$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")
mkdir -p "$BUREAUBLAD"
cp "$HOME/.local/share/applications/meldkamer.desktop" "$BUREAUBLAD/Meldkamer.desktop"
chmod +x "$BUREAUBLAD/Meldkamer.desktop"
gio set "$BUREAUBLAD/Meldkamer.desktop" metadata::trusted true 2>/dev/null || true
ok "Het dashboard opent voortaan vanzelf. Er staat ook een Meldkamer-icoon op je bureaublad."

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
cat <<EOF

${groen}=====================================================================
  ✅  KLAAR!
=====================================================================${uit}

  Op deze laptop:   ${vet}http://localhost:8123${uit}
  Op je iPhone-app: ${vet}http://$IP:8123${uit}   (schrijf dit op!)

EOF
if [ "$NIEUW" = "1" ]; then
  cat <<EOF
  ${vet}Wat nu?${uit}
  1. Er gaat zo een browser open. Maak daar je Home Assistant-account aan.
  2. Klaar? Herstart de laptop. Het dashboard opent dan vanzelf.
  3. Volg daarna de handleiding verder voor lampen, rolluiken en je telefoon.

EOF
else
  cat <<EOF
  ${vet}Bijgewerkt!${uit} Ga naar het dashboard en druk op ${vet}Ctrl + F5${uit}.
  (Home Assistant herstart even, dat kan een halve minuut duren.)

EOF
fi
cat <<EOF
  Later bijwerken? Open een terminal en typ:  ${vet}meldkamer-bijwerken${uit}

EOF
if [ "$NIEUW" = "1" ]; then
  (google-chrome --no-first-run "http://localhost:8123" >/dev/null 2>&1 &) || true
fi
