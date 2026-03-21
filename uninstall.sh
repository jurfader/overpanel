#!/bin/bash
# OVERPANEL Uninstaller
# Usage: sudo bash uninstall.sh
# This script removes OVERPANEL from the server.
# It does NOT remove Nginx, MySQL, PostgreSQL, PHP, client sites, or client databases.
set -e

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${RED}"
echo "██╗   ██╗███╗   ██╗██╗███╗   ██╗███████╗████████╗ █████╗ ██╗     ██╗     "
echo "██║   ██║████╗  ██║██║████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██║     ██║     "
echo "██║   ██║██╔██╗ ██║██║██╔██╗ ██║███████╗   ██║   ███████║██║     ██║     "
echo "██║   ██║██║╚██╗██║██║██║╚██╗██║╚════██║   ██║   ██╔══██║██║     ██║     "
echo "╚██████╔╝██║ ╚████║██║██║ ╚████║███████║   ██║   ██║  ██║███████╗███████╗"
echo " ╚═════╝ ╚═╝  ╚═══╝╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝"
echo -e "${NC}"
echo -e "${RED}⚠️  DEINSTALATOR OVERPANEL ⚠️${NC}"
echo ""
echo "Ten skrypt usunie OVERPANEL z serwera."
echo -e "${YELLOW}UWAGA: Ta operacja jest NIEODWRACALNA!${NC}"
echo ""
echo "Zostanie usunięte:"
echo "  • Serwis systemd overpanel-api i overpanel-web"
echo "  • Katalog instalacyjny /opt/overpanel"
echo "  • Konfiguracje Nginx OVERPANEL (nie strony klientów)"
echo "  • Baza danych SQLite panelu"
echo "  • Logi panelu"
echo ""
echo "NIE zostanie usunięte:"
echo "  • Nginx, MySQL, PostgreSQL, PHP (zainstalowane globalnie)"
echo "  • Strony klientów w /var/www"
echo "  • Bazy danych klientów"
echo "  • Backupy w /var/overpanel/backups"
echo ""

# Require root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Błąd: Ten skrypt musi być uruchomiony jako root (sudo bash uninstall.sh)${NC}"
  exit 1
fi

read -p "Wpisz 'USUŃ' aby potwierdzić deinstalację: " CONFIRM

if [ "$CONFIRM" != "USUŃ" ]; then
  echo "Anulowano."
  exit 0
fi

echo ""
echo -e "${YELLOW}[1/5] Zatrzymywanie serwisów...${NC}"
systemctl stop overpanel-api 2>/dev/null || true
systemctl stop overpanel-web 2>/dev/null || true
systemctl disable overpanel-api 2>/dev/null || true
systemctl disable overpanel-web 2>/dev/null || true
rm -f /etc/systemd/system/overpanel-api.service
rm -f /etc/systemd/system/overpanel-web.service
systemctl daemon-reload
echo -e "${GREEN}✓ Serwisy zatrzymane${NC}"

echo -e "${YELLOW}[2/5] Usuwanie konfiguracji Nginx...${NC}"
rm -f /etc/nginx/sites-available/overpanel
rm -f /etc/nginx/sites-enabled/overpanel
nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
echo -e "${GREEN}✓ Konfiguracja Nginx usunięta${NC}"

echo -e "${YELLOW}[3/5] Usuwanie bazy danych panelu...${NC}"
rm -f /opt/overpanel/packages/db/prisma/overpanel.db 2>/dev/null || true
rm -f /opt/overpanel/packages/db/prisma/overpanel.db-wal 2>/dev/null || true
rm -f /opt/overpanel/packages/db/prisma/overpanel.db-shm 2>/dev/null || true
echo -e "${GREEN}✓ Baza danych usunięta${NC}"

echo -e "${YELLOW}[4/5] Usuwanie plików instalacyjnych...${NC}"
rm -rf /opt/overpanel
echo -e "${GREEN}✓ Pliki usunięte${NC}"

echo -e "${YELLOW}[5/5] Czyszczenie zmiennych środowiskowych...${NC}"
rm -f /etc/profile.d/overpanel.sh 2>/dev/null || true
echo -e "${GREEN}✓ Zmienne środowiskowe wyczyszczone${NC}"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  OVERPANEL został pomyślnie odinstalowany!     ${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "Nginx, MySQL, PostgreSQL i PHP nadal działają."
echo "Strony klientów w /var/www są nienaruszone."
echo ""
