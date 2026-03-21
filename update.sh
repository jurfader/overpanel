#!/usr/bin/env bash
# ==============================================================================
# OVERPANEL — Update script
# Usage: sudo bash update.sh
# ==============================================================================
set -euo pipefail

# ------------------------------------------------------------------------------
# Colors
# ------------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR=/opt/overpanel

log_ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
log_error(){ echo -e "  ${RED}✗${NC} $1" >&2; exit 1; }
log_info() { echo -e "  ${CYAN}→${NC} $1"; }
log_step() {
    local step="$1"; shift
    echo -e "\n${CYAN}${BOLD}[ ${step} ] $*${NC}"
}

# ------------------------------------------------------------------------------
# Root check
# ------------------------------------------------------------------------------
[[ $EUID -ne 0 ]] && log_error "Run as root: sudo bash update.sh"

echo -e "\n${BOLD}${CYAN}OVERPANEL — Aktualizacja${NC}\n"

# ------------------------------------------------------------------------------
# Step 1: Pull latest code
# ------------------------------------------------------------------------------
log_step "1/6" "Pobieranie najnowszego kodu"

if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
    log_error "Nie znaleziono repozytorium w ${INSTALL_DIR}. Uruchom najpierw install.sh."
fi

log_info "git pull w ${INSTALL_DIR}..."
git -C "$INSTALL_DIR" pull --ff-only 2>/dev/null || {
    log_warn "git pull --ff-only nie powiódł się — próba fetch + merge..."
    git -C "$INSTALL_DIR" fetch origin
    git -C "$INSTALL_DIR" merge origin/main || log_error "Merge nie powiódł się. Rozwiąż konflikty ręcznie."
}
log_ok "Kod zaktualizowany"

cd "$INSTALL_DIR"

# ------------------------------------------------------------------------------
# Step 2: Install / update dependencies
# ------------------------------------------------------------------------------
log_step "2/6" "Instalowanie zależności pnpm"

pnpm install 2>/dev/null
log_ok "Zależności zaktualizowane"

# ------------------------------------------------------------------------------
# Step 3: Build shared packages
# ------------------------------------------------------------------------------
log_step "3/6" "Budowanie pakietów współdzielonych"

log_info "Budowanie @overpanel/shared..."
pnpm --filter @overpanel/shared build 2>/dev/null \
    && log_ok "@overpanel/shared zbudowany" \
    || log_warn "@overpanel/shared build pominięty (pakiet może nie istnieć)"

log_info "Budowanie @overpanel/db..."
pnpm --filter @overpanel/db build 2>/dev/null \
    && log_ok "@overpanel/db zbudowany" \
    || log_warn "@overpanel/db build pominięty (pakiet może nie istnieć)"

# ------------------------------------------------------------------------------
# Step 4: Build web (Next.js)
# ------------------------------------------------------------------------------
log_step "4/6" "Budowanie @overpanel/web (Next.js)"

pnpm --filter @overpanel/web build
log_ok "@overpanel/web zbudowany"

# ------------------------------------------------------------------------------
# Step 5: Build API
# ------------------------------------------------------------------------------
log_step "5/6" "Budowanie @overpanel/api"

pnpm --filter @overpanel/api build 2>/dev/null \
    && log_ok "@overpanel/api zbudowany" \
    || log_warn "@overpanel/api build pominięty (może używać ts-node w trybie dev)"

# ------------------------------------------------------------------------------
# Step 6: Restart services
# ------------------------------------------------------------------------------
log_step "6/6" "Restartowanie usług"

log_info "Restartowanie overpanel-api..."
systemctl restart overpanel-api \
    && log_ok "overpanel-api zrestartowany" \
    || log_warn "Nie można zrestartować overpanel-api (sprawdź: journalctl -u overpanel-api)"

log_info "Restartowanie overpanel-web..."
systemctl restart overpanel-web \
    && log_ok "overpanel-web zrestartowany" \
    || log_warn "Nie można zrestartować overpanel-web (sprawdź: journalctl -u overpanel-web)"

# Brief pause to let services start
sleep 2

API_STATUS=$(systemctl is-active overpanel-api 2>/dev/null || echo "unknown")
WEB_STATUS=$(systemctl is-active overpanel-web 2>/dev/null || echo "unknown")

echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║                                              ║"
echo "  ║      OVERPANEL zaktualizowany!               ║"
echo "  ║                                              ║"
printf "  ║  API status:  %-30s║\n" "${API_STATUS}"
printf "  ║  Web status:  %-30s║\n" "${WEB_STATUS}"
echo "  ║                                              ║"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${NC}"
