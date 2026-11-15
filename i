#!/usr/bin/env bash
# Korte starter voor het Meldkamer-dashboard. Gebruik:
#   wget -qO- semsterkebnurg.github.io/-Hulpdiensten-App/i | bash
set -e
URL="https://raw.githubusercontent.com/semsterkebnurg/-Hulpdiensten-App/claude/capabilities-overview-qws35m/meldkamer/installeer.sh"
wget -qO /tmp/meldkamer-installeer.sh "$URL"
bash /tmp/meldkamer-installeer.sh
