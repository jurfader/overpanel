#!/usr/bin/env bash
# ==============================================================================
# OVERPANEL — One-command installer
# Supports: Ubuntu 20.04 / 22.04 / 24.04 LTS
# Usage:    sudo bash install.sh
# ==============================================================================
set -euo pipefail

# ------------------------------------------------------------------------------
# Colors & formatting
# ------------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'   # No Color

TOTAL_STEPS=15
CURRENT_STEP=0

# ------------------------------------------------------------------------------
# Helper functions
# ------------------------------------------------------------------------------
log_step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    echo -e "\n${CYAN}${BOLD}[ ${CURRENT_STEP}/${TOTAL_STEPS} ] $1${NC}"
}

log_ok() {
    echo -e "  ${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "  ${YELLOW}⚠${NC}  $1"
}

log_error() {
    echo -e "  ${RED}✗${NC} $1" >&2
    exit 1
}

log_info() {
    echo -e "  ${CYAN}→${NC} $1"
}

banner() {
    echo -e "${CYAN}${BOLD}"
    echo "  ╔═══════════════════════════════════════════════════╗"
    echo "  ║                                                   ║"
    echo "  ║    ██████╗ ██╗   ██╗███████╗██████╗              ║"
    echo "  ║   ██╔═══██╗██║   ██║██╔════╝██╔══██╗             ║"
    echo "  ║   ██║   ██║██║   ██║█████╗  ██████╔╝             ║"
    echo "  ║   ██║   ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗             ║"
    echo "  ║   ╚██████╔╝ ╚████╔╝ ███████╗██║  ██║             ║"
    echo "  ║    ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝             ║"
    echo "  ║                                                   ║"
    echo "  ║         P A N E L   I N S T A L L E R            ║"
    echo "  ║                                                   ║"
    echo "  ╚═══════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ------------------------------------------------------------------------------
# Root check
# ------------------------------------------------------------------------------
[[ $EUID -ne 0 ]] && log_error "Run as root: sudo bash install.sh"

# Print banner
banner

echo -e "${BOLD}Witaj w instalatorze OVERPANEL!${NC}"
echo "Ten skrypt zainstaluje pełny stos VPS hosting control panel."
echo ""

# ==============================================================================
# STEP 1: System detection
# ==============================================================================
log_step "Wykrywanie systemu"

if [[ -f /etc/os-release ]]; then
    source /etc/os-release
    OS_NAME="${NAME:-Unknown}"
    OS_VERSION="${VERSION_ID:-0}"
    log_ok "System: ${OS_NAME} ${OS_VERSION}"
else
    log_warn "Nie można odczytać /etc/os-release"
    OS_NAME="Unknown"
    OS_VERSION="0"
fi

# Warn if not a supported Ubuntu version
if [[ "$OS_NAME" != *"Ubuntu"* ]]; then
    log_warn "Ten skrypt jest zoptymalizowany dla Ubuntu. Wykryto: ${OS_NAME}"
    log_warn "Kontynuowanie może się nie powieść."
else
    case "$OS_VERSION" in
        20.04|22.04|24.04)
            log_ok "Obsługiwana wersja Ubuntu: ${OS_VERSION}"
            ;;
        *)
            log_warn "Ubuntu ${OS_VERSION} nie jest oficjalnie obsługiwane (20.04/22.04/24.04)"
            log_warn "Skrypt spróbuje kontynuować, ale mogą wystąpić problemy."
            ;;
    esac
fi

log_info "Aktualizowanie listy pakietów..."
apt-get update -qq
log_ok "Lista pakietów zaktualizowana"

# ==============================================================================
# STEP 2: Interactive questions
# ==============================================================================
log_step "Konfiguracja instalacji"

echo ""
echo -e "${BOLD}Odpowiedz na kilka pytań, aby skonfigurować OVERPANEL:${NC}"
echo ""

# --- PANEL_DOMAIN ---
while true; do
    read -r -p "  Domena panelu (np. panel.example.com): " PANEL_DOMAIN
    # Validate: not empty + basic domain format (contains a dot, no spaces, no slashes)
    if [[ -z "$PANEL_DOMAIN" ]]; then
        echo -e "  ${RED}Domena nie może być pusta.${NC}"
    elif [[ ! "$PANEL_DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)+$ ]]; then
        echo -e "  ${RED}Nieprawidłowy format domeny. Przykład: panel.example.com${NC}"
    else
        break
    fi
done

# --- ADMIN_EMAIL ---
while true; do
    read -r -p "  E-mail administratora (SSL + konto admina): " ADMIN_EMAIL
    if [[ "$ADMIN_EMAIL" != *"@"* ]] || [[ -z "$ADMIN_EMAIL" ]]; then
        echo -e "  ${RED}Nieprawidłowy adres e-mail (musi zawierać @).${NC}"
    else
        break
    fi
done

# --- ADMIN_PASSWORD ---
while true; do
    read -r -s -p "  Hasło administratora (min. 8 znaków): " ADMIN_PASSWORD
    echo ""
    if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
        echo -e "  ${RED}Hasło musi mieć minimum 8 znaków.${NC}"
        continue
    fi
    read -r -s -p "  Powtórz hasło: " ADMIN_PASSWORD_CONFIRM
    echo ""
    if [[ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]]; then
        echo -e "  ${RED}Hasła nie są identyczne. Spróbuj ponownie.${NC}"
    else
        break
    fi
done

# --- CF_API_TOKEN (optional) ---
read -r -s -p "  Cloudflare API Token (opcjonalnie, Enter aby pominąć): " CF_API_TOKEN
echo ""
if [[ -z "$CF_API_TOKEN" ]]; then
    log_warn "Cloudflare API Token pominięty"
fi

# --- Summary ---
echo ""
echo -e "${BOLD}Podsumowanie konfiguracji:${NC}"
echo -e "  Domena:          ${CYAN}${PANEL_DOMAIN}${NC}"
echo -e "  E-mail:          ${CYAN}${ADMIN_EMAIL}${NC}"
echo -e "  Hasło:           ${CYAN}[ukryte]${NC}"
echo -e "  CF API Token:    ${CYAN}${CF_API_TOKEN:+[ustawiony]}${CF_API_TOKEN:-[pominięty]}${NC}"
echo ""

read -r -p "  Kontynuować instalację? [Y/n]: " CONFIRM
CONFIRM="${CONFIRM:-Y}"
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "\n${YELLOW}Instalacja anulowana przez użytkownika.${NC}"
    exit 0
fi

# ==============================================================================
# STEP 3: Install system dependencies
# ==============================================================================
log_step "Instalacja zależności systemowych"

log_info "Instalowanie niezbędnych pakietów..."
apt-get install -y -qq \
    curl \
    wget \
    git \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    openssl

log_ok "Zależności systemowe zainstalowane"

# --- Ensure swap exists (pnpm install needs ~1.5 GB RAM) ---
TOTAL_RAM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
SWAP_MB=$(awk '/SwapTotal/ {printf "%d", $2/1024}' /proc/meminfo)
if [[ "$SWAP_MB" -lt 512 ]]; then
    log_info "RAM: ${TOTAL_RAM_MB} MB, Swap: ${SWAP_MB} MB — tworzenie swap 2 GB..."
    if [[ ! -f /swapfile ]]; then
        fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
        chmod 600 /swapfile
        mkswap /swapfile > /dev/null 2>&1
    fi
    swapon /swapfile 2>/dev/null || true
    # Persist across reboots
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    log_ok "Swap 2 GB aktywny"
else
    log_info "Swap już skonfigurowany: ${SWAP_MB} MB"
fi

# ==============================================================================
# STEP 4: Install Node.js 20
# ==============================================================================
log_step "Instalacja Node.js 20"

if command -v node &>/dev/null; then
    NODE_CURRENT=$(node --version 2>/dev/null || echo "unknown")
    NODE_MAJOR=$(node -e "process.stdout.write(String(parseInt(process.version.slice(1))))" 2>/dev/null || echo "0")
    log_warn "Node.js już zainstalowany: ${NODE_CURRENT}"
    if [[ "$NODE_MAJOR" -ge 18 ]]; then
        log_ok "Node.js ${NODE_CURRENT} (>= 18) — pomijam instalację"
    else
        log_info "Node.js ${NODE_CURRENT} — za stara wersja, aktualizacja do 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
        apt-get install -y nodejs > /dev/null 2>&1
    fi
else
    log_info "Pobieranie i instalowanie Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y nodejs > /dev/null 2>&1
fi

NODE_VER=$(node --version)
NPM_VER=$(npm --version)
log_ok "Node.js: ${NODE_VER}"
log_ok "npm:     v${NPM_VER}"

# ==============================================================================
# STEP 5: Install pnpm
# ==============================================================================
log_step "Instalacja pnpm"

log_info "Instalowanie pnpm (globalnie przez npm)..."
npm install -g pnpm@latest > /dev/null 2>&1

PNPM_VER=$(pnpm --version)
log_ok "pnpm: v${PNPM_VER}"

# ==============================================================================
# STEP 6: Install Nginx
# ==============================================================================
log_step "Instalacja Nginx"

if systemctl is-active --quiet nginx 2>/dev/null; then
    log_warn "Nginx już działa — pomijam instalację"
else
    # Disable Apache if it's running (conflicts with port 80)
    if systemctl is-active --quiet apache2 2>/dev/null; then
        log_warn "Apache2 wykryty na porcie 80 — wyłączam..."
        systemctl stop apache2 > /dev/null 2>&1
        systemctl disable apache2 > /dev/null 2>&1
        log_ok "Apache2 wyłączony"
    fi
    # Kill anything else on port 80
    fuser -k 80/tcp > /dev/null 2>&1 || true
    fuser -k 443/tcp > /dev/null 2>&1 || true

    log_info "Instalowanie Nginx..."
    apt-get install -y nginx > /dev/null 2>&1

    # Ensure mime.types exists (may be missing after CloudPanel or other panel removal)
    if [[ ! -f /etc/nginx/mime.types ]]; then
        log_warn "Brak /etc/nginx/mime.types — odtwarzanie z paczki..."
        mkdir -p /tmp/nginx-extract-tmp
        DEB=$(ls /var/cache/apt/archives/nginx_*.deb 2>/dev/null | head -1)
        if [[ -n "$DEB" ]]; then
            dpkg -x "$DEB" /tmp/nginx-extract-tmp 2>/dev/null
            cp /tmp/nginx-extract-tmp/etc/nginx/mime.types /etc/nginx/mime.types 2>/dev/null || true
            cp /tmp/nginx-extract-tmp/etc/nginx/fastcgi_params /etc/nginx/fastcgi_params 2>/dev/null || true
            rm -rf /tmp/nginx-extract-tmp
        else
            curl -sS -o /etc/nginx/mime.types https://raw.githubusercontent.com/nginx/nginx/master/conf/mime.types 2>/dev/null || true
        fi
    fi

    # Ensure sites-available/sites-enabled exist (nginx.org package uses conf.d instead)
    mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d

    # If nginx.conf doesn't include sites-enabled, patch it
    if ! grep -q "sites-enabled" /etc/nginx/nginx.conf 2>/dev/null; then
        sed -i '/include \/etc\/nginx\/conf\.d/a\    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf 2>/dev/null || true
    fi

    systemctl enable nginx > /dev/null 2>&1
    systemctl start nginx || {
        log_warn "Nginx nie wystartował — sprawdzanie logów..."
        journalctl -xeu nginx.service --no-pager | tail -5 >&2
        log_error "Nginx nie mógł wystartować. Sprawdź: journalctl -xeu nginx.service"
    }
fi

NGINX_VER=$(nginx -v 2>&1 | awk -F'/' '{print $2}')
log_ok "Nginx: ${NGINX_VER}"

# ==============================================================================
# STEP 7: Install MySQL 8
# ==============================================================================
log_step "Instalacja MySQL 8"

# Store password to a file for idempotency
MYSQL_PASS_FILE="/root/.overpanel_mysql_pass"

# Helper: set/read root password once MySQL is confirmed running
_mysql_configure_root_pass() {
    if [[ -f "$MYSQL_PASS_FILE" ]]; then
        MYSQL_ROOT_PASS=$(cat "$MYSQL_PASS_FILE")
        log_ok "Hasło MySQL odczytane z ${MYSQL_PASS_FILE}"
    else
        MYSQL_ROOT_PASS=$(openssl rand -base64 16 | tr -d '=/+')
        echo "$MYSQL_ROOT_PASS" > "$MYSQL_PASS_FILE"
        chmod 600 "$MYSQL_PASS_FILE"
        log_warn "Ustawianie nowego hasła root MySQL..."
        mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';" 2>/dev/null || true
        mysql -e "FLUSH PRIVILEGES;" 2>/dev/null || true
    fi
}

INSTALL_MYSQL=false

if mysqladmin ping --silent 2>/dev/null; then
    # Any MySQL/Percona variant is already up
    log_warn "MySQL/Percona już działa — pomijam instalację"
    _mysql_configure_root_pass
elif command -v mysqld &>/dev/null || command -v mysql &>/dev/null; then
    # Binary present but service not running — try to start it
    log_warn "MySQL zainstalowany ale nie działa — próba uruchomienia..."
    # Fix missing my.cnf if needed (common after CloudPanel removal)
    if [[ ! -f /etc/mysql/my.cnf ]]; then
        mkdir -p /etc/mysql
        cat > /etc/mysql/my.cnf << 'MYCNF'
[mysqld]
user = mysql
datadir = /var/lib/mysql
socket = /var/run/mysqld/mysqld.sock
pid-file = /var/run/mysqld/mysqld.pid
log-error = /var/log/mysql/error.log

[client]
socket = /var/run/mysqld/mysqld.sock
MYCNF
        mkdir -p /var/run/mysqld /var/log/mysql
        chown mysql:mysql /var/run/mysqld /var/log/mysql 2>/dev/null || true
    fi
    systemctl start mysql 2>/dev/null || systemctl start mysqld 2>/dev/null || true
    sleep 2
    if mysqladmin ping --silent 2>/dev/null; then
        log_ok "MySQL uruchomiony pomyślnie"
        _mysql_configure_root_pass
    else
        log_warn "MySQL nie mógł wystartować — instalacja standardowego MySQL 8..."
        INSTALL_MYSQL=true
    fi
else
    INSTALL_MYSQL=true
fi

if [[ "$INSTALL_MYSQL" == "true" ]]; then
    log_info "Instalowanie MySQL Server 8..."
    apt-get install -y mysql-server > /dev/null 2>&1
    systemctl enable mysql > /dev/null 2>&1
    systemctl start mysql

    MYSQL_ROOT_PASS=$(openssl rand -base64 16 | tr -d '=/+')
    echo "$MYSQL_ROOT_PASS" > "$MYSQL_PASS_FILE"
    chmod 600 "$MYSQL_PASS_FILE"

    log_info "Konfigurowanie hasła root MySQL..."
    mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';" 2>/dev/null \
        || mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';"
    mysql -u root -p"${MYSQL_ROOT_PASS}" -e "FLUSH PRIVILEGES;"
fi

log_ok "MySQL działa. Hasło root: ${MYSQL_ROOT_PASS}"
log_info "Hasło zapisano w: ${MYSQL_PASS_FILE}"

# ==============================================================================
# STEP 8: Install PostgreSQL 16
# ==============================================================================
log_step "Instalacja PostgreSQL"

# Store PG password for idempotency
PG_PASS_FILE="/root/.overpanel_pg_pass"

if systemctl is-active --quiet postgresql 2>/dev/null; then
    log_warn "PostgreSQL już działa"
    if [[ -f "$PG_PASS_FILE" ]]; then
        PG_PASS=$(cat "$PG_PASS_FILE")
        log_ok "Hasło PostgreSQL odczytane z ${PG_PASS_FILE}"
    else
        PG_PASS=$(openssl rand -base64 16 | tr -d '=/+')
        echo "$PG_PASS" > "$PG_PASS_FILE"
        chmod 600 "$PG_PASS_FILE"
    fi
else
    log_info "Instalowanie PostgreSQL..."
    apt-get install -y postgresql postgresql-contrib > /dev/null 2>&1
    systemctl enable postgresql > /dev/null 2>&1
    systemctl start postgresql

    PG_PASS=$(openssl rand -base64 16 | tr -d '=/+')
    echo "$PG_PASS" > "$PG_PASS_FILE"
    chmod 600 "$PG_PASS_FILE"
fi

# Create overpanel user (idempotent)
log_info "Konfigurowanie użytkownika PostgreSQL 'overpanel'..."
sudo -u postgres psql -c "CREATE USER overpanel WITH PASSWORD '${PG_PASS}';" 2>/dev/null || true
sudo -u postgres psql -c "ALTER USER overpanel WITH PASSWORD '${PG_PASS}';" 2>/dev/null

PG_VER=$(sudo -u postgres psql -c "SELECT version();" -t 2>/dev/null | head -1 | awk '{print $1" "$2}' || echo "unknown")
log_ok "PostgreSQL: ${PG_VER}"
log_info "Hasło zapisano w: ${PG_PASS_FILE}"

# ==============================================================================
# STEP 9: Install PHP 8.3
# ==============================================================================
log_step "Instalacja PHP 8.3 + rozszerzenia"

if php8.3 --version &>/dev/null 2>&1; then
    log_warn "PHP 8.3 już zainstalowane — pomijam"
else
    log_info "Dodawanie repozytorium ondrej/php PPA..."
    add-apt-repository -y ppa:ondrej/php > /dev/null 2>&1
    apt-get update -qq

    log_info "Instalowanie PHP 8.3 i rozszerzeń..."
    apt-get install -y \
        php8.3-fpm \
        php8.3-cli \
        php8.3-mysql \
        php8.3-pgsql \
        php8.3-curl \
        php8.3-mbstring \
        php8.3-xml \
        php8.3-zip \
        php8.3-gd \
        php8.3-intl \
        php8.3-bcmath > /dev/null 2>&1

    systemctl enable php8.3-fpm > /dev/null 2>&1
    systemctl start php8.3-fpm
fi

PHP_VER=$(php8.3 --version 2>/dev/null | head -1 | awk '{print $1" "$2}')
log_ok "${PHP_VER}"

# ==============================================================================
# STEP 10: Install WP-CLI
# ==============================================================================
log_step "Instalacja WP-CLI"

if command -v wp &>/dev/null; then
    WP_VER=$(wp --version --allow-root 2>/dev/null || echo "unknown")
    log_warn "WP-CLI już zainstalowane: ${WP_VER} — pomijam"
else
    log_info "Pobieranie WP-CLI..."
    TMP_WP="/tmp/wp-cli.phar"
    curl -sS -o "$TMP_WP" https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar

    log_info "Weryfikacja WP-CLI..."
    if php "$TMP_WP" --info --allow-root > /dev/null 2>&1; then
        chmod +x "$TMP_WP"
        mv "$TMP_WP" /usr/local/bin/wp
    else
        log_warn "WP-CLI weryfikacja nieudana — próba ponownego pobrania..."
        curl -sL -o "$TMP_WP" "https://github.com/wp-cli/wp-cli/releases/latest/download/wp-cli.phar" 2>/dev/null
        if php "$TMP_WP" --info --allow-root > /dev/null 2>&1; then
            chmod +x "$TMP_WP"
            mv "$TMP_WP" /usr/local/bin/wp
        else
            log_warn "WP-CLI nie udało się zainstalować — WordPress auto-installer będzie niedostępny"
            rm -f "$TMP_WP"
        fi
    fi
fi

WP_VER=$(wp --version --allow-root 2>/dev/null || echo "niedostępny")
log_ok "WP-CLI: ${WP_VER}"

# ==============================================================================
# STEP 11: Install Certbot + UFW firewall
# ==============================================================================
log_step "Instalacja Certbot + konfiguracja UFW"

log_info "Instalowanie Certbot..."
apt-get install -y certbot python3-certbot-nginx > /dev/null 2>&1
log_ok "Certbot zainstalowany"

log_info "Konfigurowanie UFW (firewall)..."
apt-get install -y ufw > /dev/null 2>&1

# Enable UFW (--force skips the interactive prompt)
ufw --force enable > /dev/null 2>&1

# Allow essential ports
ufw allow 22/tcp  > /dev/null 2>&1
ufw allow 80/tcp  > /dev/null 2>&1
ufw allow 443/tcp > /dev/null 2>&1

log_ok "UFW aktywny. Porty 22, 80, 443 odblokowane."

UFW_STATUS=$(ufw status | head -1)
log_info "UFW status: ${UFW_STATUS}"

# ==============================================================================
# STEP 11b: Install Docker
# ==============================================================================
log_step "Instalacja Docker"

log_info "Instalowanie Docker Engine..."
apt-get install -y ca-certificates curl gnupg > /dev/null 2>&1
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg > /dev/null 2>&1
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -qq > /dev/null 2>&1
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin > /dev/null 2>&1
systemctl enable docker > /dev/null 2>&1
systemctl start docker > /dev/null 2>&1
DOCKER_VER=$(docker --version 2>/dev/null | grep -oP 'version \K[\d.]+' || echo "unknown")
log_ok "Docker ${DOCKER_VER} zainstalowany i uruchomiony"

# Create Docker data directory
mkdir -p /opt/docker-data
log_ok "Katalog danych Docker: /opt/docker-data"

# ==============================================================================
# STEP 12: Clone and build OVERPANEL
# ==============================================================================
log_step "Klonowanie i budowanie OVERPANEL"

INSTALL_DIR=/opt/overpanel
REPO_URL="https://github.com/jurfader/overpanel.git"

# --- Resolve clone URL (support private repo via GH_TOKEN) ---
GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -n "$GH_TOKEN" ]]; then
    CLONE_URL="https://${GH_TOKEN}@github.com/jurfader/overpanel.git"
    log_ok "Używam tokenu GitHub do klonowania"
else
    CLONE_URL="$REPO_URL"
fi

# --- Clone or update ---
if [[ -d "${INSTALL_DIR}/.git" ]]; then
    log_info "Repozytorium już istnieje — aktualizowanie..."
    if [[ -n "$GH_TOKEN" ]]; then
        git -C "$INSTALL_DIR" remote set-url origin "$CLONE_URL" 2>/dev/null || true
    fi
    git -C "$INSTALL_DIR" pull --ff-only 2>/dev/null || {
        log_warn "git pull nie powiódł się — kontynuuję z aktualnym stanem"
    }
    log_ok "Repozytorium zaktualizowane"
else
    log_info "Klonowanie repozytorium OVERPANEL..."
    git clone "$CLONE_URL" "$INSTALL_DIR" 2>/dev/null || {
        log_warn "Klonowanie GitHub nie powiodło się — używam bieżącego katalogu jako dev mode"
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        INSTALL_DIR="$SCRIPT_DIR"
        log_info "Katalog instalacji: ${INSTALL_DIR}"
    }
fi

cd "$INSTALL_DIR"

# --- Install dependencies ---
log_info "Konfigurowanie uprawnień build scripts..."
cat > "${INSTALL_DIR}/.npmrc" << 'NPMRC'
enable-pre-post-scripts=true
ignore-scripts=false
NPMRC

log_info "Instalowanie zależności pnpm..."
pnpm install --no-frozen-lockfile 2>&1 | grep -v "^$" | tail -5
# Rebuild ALL native modules explicitly (pnpm v10 may block build scripts)
log_info "Kompilowanie modułów natywnych..."
pnpm rebuild 2>&1 | tail -3 || true
log_ok "Zależności zainstalowane"

# --- Generate Prisma client before any build ---
log_info "Generowanie klienta Prisma..."
cd "${INSTALL_DIR}/packages/db"
"${INSTALL_DIR}/node_modules/.bin/prisma" generate --schema=prisma/schema.prisma 2>/dev/null \
    || "${INSTALL_DIR}/packages/db/node_modules/.bin/prisma" generate 2>/dev/null \
    || npx --yes prisma@5 generate 2>/dev/null \
    || log_warn "Prisma generate nieudane"
cd "$INSTALL_DIR"

# --- Build shared packages ---
log_info "Budowanie pakietu @overpanel/shared..."
pnpm --filter @overpanel/shared build 2>/dev/null || log_warn "@overpanel/shared build failed (może nie istnieć)"

log_info "Budowanie pakietu @overpanel/db..."
pnpm --filter @overpanel/db build 2>/dev/null || log_warn "@overpanel/db build failed (może nie istnieć)"

# --- Generate secrets ---
JWT_SECRET=$(openssl rand -base64 32)
DB_PATH="${INSTALL_DIR}/packages/db/panel.db"

# --- Create .env for API ---
log_info "Tworzenie pliku .env dla API..."
mkdir -p "${INSTALL_DIR}/apps/api"
cat > "${INSTALL_DIR}/apps/api/.env" << EOF
DATABASE_URL="file:${DB_PATH}"
JWT_SECRET="${JWT_SECRET}"
PORT=4000
HOST=0.0.0.0
FRONTEND_URL=https://${PANEL_DOMAIN}
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASS}
SSL_EMAIL=${ADMIN_EMAIL}
CF_API_TOKEN=${CF_API_TOKEN}
EOF
log_ok ".env API zapisany"

# --- Create .env.local for Web ---
log_info "Tworzenie pliku .env.local dla Web..."
mkdir -p "${INSTALL_DIR}/apps/web"
# API_URL empty = relative paths → nginx proxies /api/ to Fastify on port 4000
cat > "${INSTALL_DIR}/apps/web/.env.local" << EOF
NEXT_PUBLIC_API_URL=
EOF
log_ok ".env.local Web zapisany"

# --- Push DB schema ---
log_info "Generowanie klienta Prisma i aktualizowanie schematu..."
export DATABASE_URL="file:${INSTALL_DIR}/packages/db/panel.db"
cd "${INSTALL_DIR}/packages/db"
"${INSTALL_DIR}/node_modules/.bin/prisma" generate --schema=prisma/schema.prisma 2>/dev/null \
    || "${INSTALL_DIR}/packages/db/node_modules/.bin/prisma" generate 2>/dev/null \
    || npx --yes prisma@5 generate 2>/dev/null \
    || log_warn "Prisma generate nieudane"
"${INSTALL_DIR}/node_modules/.bin/prisma" db push --skip-generate 2>/dev/null || \
    "${INSTALL_DIR}/packages/db/node_modules/.bin/prisma" db push --skip-generate 2>/dev/null || \
    pnpm exec prisma db push --skip-generate 2>/dev/null || \
    log_warn "Prisma db push nie powiódł się — baza danych może wymagać ręcznej migracji"
cd "$INSTALL_DIR"

# --- Create admin user ---
log_info "Tworzenie użytkownika administratora..."
# Use bcryptjs (pure JS — no native compilation needed)
# Try from apps/api where bcryptjs is a direct dependency
ADMIN_HASH=$(cd "${INSTALL_DIR}/apps/api" && node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('${ADMIN_PASSWORD}', 12).then(h => process.stdout.write(h));
" 2>/dev/null) || ADMIN_HASH=$(NODE_PATH="${INSTALL_DIR}/node_modules" node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('${ADMIN_PASSWORD}', 12).then(h => process.stdout.write(h));
" 2>/dev/null) || {
    log_warn "Nie można zahashować hasła — admin zostanie utworzony przy pierwszym uruchomieniu"
    log_info "Możesz też uruchomić: cd /opt/overpanel && node packages/db/dist/seed.js"
}

if [[ -n "${ADMIN_HASH:-}" ]]; then
    DATABASE_URL="file:${INSTALL_DIR}/packages/db/panel.db" \
    NODE_PATH="${INSTALL_DIR}/node_modules" \
    node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.upsert({
  where:  { email: '${ADMIN_EMAIL}' },
  update: { passwordHash: '${ADMIN_HASH}', role: 'admin' },
  create: {
    email:        '${ADMIN_EMAIL}',
    name:         'Administrator',
    passwordHash: '${ADMIN_HASH}',
    role:         'admin'
  }
}).then(() => {
  console.log('OK');
  return p.\$disconnect();
}).catch(e => {
  console.error(e.message);
  process.exit(1);
});
" 2>/dev/null && log_ok "Użytkownik admin '${ADMIN_EMAIL}' utworzony/zaktualizowany" \
    || log_warn "Nie można utworzyć admina przez Prisma — sprawdź schemat DB"
fi

# --- Build apps ---
log_info "Budowanie @overpanel/api..."
pnpm --filter "@overpanel/api" build 2>&1 | tail -5 || \
    (cd "${INSTALL_DIR}/apps/api" && pnpm build 2>&1 | tail -5) || \
    log_warn "@overpanel/api build nieudany — serwer może nie działać poprawnie"

log_info "Budowanie @overpanel/web (Next.js)..."
cd "${INSTALL_DIR}/apps/web"
pnpm build 2>&1 | tail -10 || log_warn "Web build nieudany"
# Copy static assets into standalone output (required for standalone mode)
# With outputFileTracingRoot set to monorepo root, standalone mirrors the monorepo structure:
#   .next/standalone/apps/web/server.js  (entry point)
#   .next/standalone/apps/web/.next/     (build output)
STANDALONE_WEB=".next/standalone/apps/web"
if [[ -d ".next/standalone" ]]; then
    # Determine actual server.js location
    if [[ -f "${STANDALONE_WEB}/server.js" ]]; then
        log_info "Standalone: monorepo layout (apps/web/server.js)"
        cp -r public "${STANDALONE_WEB}/public" 2>/dev/null || true
        mkdir -p "${STANDALONE_WEB}/.next"
        cp -r .next/static "${STANDALONE_WEB}/.next/static" 2>/dev/null || true
    elif [[ -f ".next/standalone/server.js" ]]; then
        log_info "Standalone: flat layout (server.js)"
        cp -r public .next/standalone/public 2>/dev/null || true
        mkdir -p .next/standalone/.next
        cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
    else
        log_warn "Nie znaleziono server.js w standalone — sprawdź build"
    fi
fi
cd "${INSTALL_DIR}"
log_ok "Aplikacje zbudowane"

cd "$INSTALL_DIR"

# ==============================================================================
# STEP 13: Configure Nginx
# ==============================================================================
log_step "Konfiguracja Nginx dla OVERPANEL"

log_info "Zapisywanie konfiguracji Nginx..."

# Ensure nginx directory structure exists (nginx.org package uses conf.d, not sites-enabled)
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d

# Ensure nginx.conf includes sites-enabled (nginx.org package may not have this)
if ! grep -q "sites-enabled" /etc/nginx/nginx.conf 2>/dev/null; then
    # Add sites-enabled include before the closing brace of http block
    sed -i '/include \/etc\/nginx\/conf\.d/a\    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf 2>/dev/null || true
fi

cat > /etc/nginx/sites-available/overpanel << 'NGINX_CONF'
# OVERPANEL — Nginx reverse proxy
# Generated by install.sh — do not edit manually

server {
    listen 80;
    server_name PANEL_DOMAIN_PLACEHOLDER;

    # API — Fastify (port 4000)
    location /api/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # WebSocket / Socket.IO — API (port 4000)
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend — Next.js (port 3333)
    location / {
        proxy_pass         http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINX_CONF

# Replace domain placeholder with actual domain
sed -i "s/PANEL_DOMAIN_PLACEHOLDER/${PANEL_DOMAIN}/" /etc/nginx/sites-available/overpanel

# Enable site, disable defaults
ln -sf /etc/nginx/sites-available/overpanel /etc/nginx/sites-enabled/overpanel
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/conf.d/default.conf

# Test and reload
nginx -t 2>/dev/null && systemctl reload nginx
log_ok "Nginx skonfigurowany i przeładowany"

# ==============================================================================
# STEP 14: SSL certificate (Certbot)
# ==============================================================================
log_step "Uzyskiwanie certyfikatu SSL (Let's Encrypt)"

log_info "Domena: ${PANEL_DOMAIN}"
log_info "E-mail: ${ADMIN_EMAIL}"
log_warn "Upewnij się, że DNS domeny wskazuje na ten serwer przed kontynuowaniem."

# Run certbot — if it fails, warn but don't abort the whole install
certbot --nginx \
    -d "${PANEL_DOMAIN}" \
    --non-interactive \
    --agree-tos \
    -m "${ADMIN_EMAIL}" \
    --redirect \
    2>/dev/null && {
    log_ok "Certyfikat SSL uzyskany i skonfigurowany"
    log_ok "Nginx przeładowany z HTTPS"
} || {
    log_warn "Certbot nie powiódł się — panel dostępny tymczasowo przez HTTP"
    log_warn "Sprawdź DNS i uruchom ręcznie:"
    log_warn "  certbot --nginx -d ${PANEL_DOMAIN} -m ${ADMIN_EMAIL} --agree-tos --redirect"
}

# ==============================================================================
# Cloudflare Tunnel — dodanie domeny panelu
# ==============================================================================
if [[ -n "${CF_API_TOKEN}" ]] && command -v cloudflared &>/dev/null; then
    log_info "Wykrywanie konfiguracji tunelu Cloudflare..."

    # Find config file — common locations
    CF_CONFIG=""
    for candidate in \
        /etc/cloudflared/config.yml \
        /root/.cloudflared/config.yml \
        /home/cloudflared/.cloudflared/config.yml \
        /usr/local/etc/cloudflared/config.yml; do
        if [[ -f "$candidate" ]]; then
            CF_CONFIG="$candidate"
            break
        fi
    done

    # Also check running cloudflared process for --config flag
    if [[ -z "$CF_CONFIG" ]]; then
        CF_CONFIG=$(ps aux | grep cloudflared | grep -oP '(?<=--config )\S+' | head -1 || true)
    fi

    if [[ -n "$CF_CONFIG" ]]; then
        log_ok "Znaleziono config tunelu: ${CF_CONFIG}"

        # Check if panel domain is already configured
        if grep -q "${PANEL_DOMAIN}" "$CF_CONFIG" 2>/dev/null; then
            log_warn "Domena ${PANEL_DOMAIN} już istnieje w konfiguracji tunelu"
            echo -e "  ${YELLOW}Aktualny wpis:${NC}"
            grep -A1 "hostname.*${PANEL_DOMAIN}" "$CF_CONFIG" 2>/dev/null | sed 's/^/    /'
            echo -e "  ${CYAN}Nowy wpis: hostname: ${PANEL_DOMAIN} → http://localhost:3333${NC}"

            # Ask if user wants to update/fix the entry
            UPDATE_CF="n"
            read -r -p "  Czy zaktualizować wpis dla ${PANEL_DOMAIN}? [y/N]: " UPDATE_CF
            if [[ "${UPDATE_CF,,}" == "y" ]]; then
                # Remove existing lines for this domain (hostname line + service line below it)
                sed -i "/hostname: ${PANEL_DOMAIN}/,+1d" "$CF_CONFIG"
                # Also remove if written as "hostname:DOMAIN" (no space)
                sed -i "/hostname:${PANEL_DOMAIN}/,+1d" "$CF_CONFIG"

                # Now insert fresh entry
                PANEL_INGRESS="  - hostname: ${PANEL_DOMAIN}\n    service: http://localhost:3333"
                if grep -q "http_status:404\|http_status: 404" "$CF_CONFIG"; then
                    sed -i "s|.*http_status:404.*|${PANEL_INGRESS}\n  - service: http_status:404|" "$CF_CONFIG"
                elif grep -q "^ingress:" "$CF_CONFIG"; then
                    echo -e "${PANEL_INGRESS}" >> "$CF_CONFIG"
                else
                    printf '\ningress:\n%s\n  - service: http_status:404\n' "$(echo -e "${PANEL_INGRESS}")" >> "$CF_CONFIG"
                fi

                log_ok "Zaktualizowano wpis ${PANEL_DOMAIN} → http://localhost:3333"

                systemctl restart cloudflared 2>/dev/null \
                    || systemctl restart cloudflared.service 2>/dev/null \
                    || true
                sleep 2
                if systemctl is-active --quiet cloudflared 2>/dev/null; then
                    log_ok "Cloudflare Tunnel zrestartowany"
                else
                    log_warn "Cloudflare Tunnel nie zrestartowany — uruchom ręcznie: systemctl restart cloudflared"
                fi
            else
                log_info "Pominięto aktualizację konfiguracji tunelu"
            fi
        else
            # Build ingress entry for panel
            PANEL_INGRESS="  - hostname: ${PANEL_DOMAIN}\n    service: http://localhost:3333"

            # Insert before the catch-all line (last ingress rule)
            if grep -q "http_status:404\|http_status: 404" "$CF_CONFIG"; then
                # Insert before the catch-all
                sed -i "s|.*http_status:404.*|${PANEL_INGRESS}\n  - service: http_status:404|" "$CF_CONFIG"
            elif grep -q "^ingress:" "$CF_CONFIG"; then
                # Append to ingress section before EOF
                echo -e "${PANEL_INGRESS}" >> "$CF_CONFIG"
            else
                # No ingress section — append full ingress block
                printf '\ningress:\n%s\n  - service: http_status:404\n' "$(echo -e "${PANEL_INGRESS}")" >> "$CF_CONFIG"
            fi

            log_ok "Dodano ${PANEL_DOMAIN} do konfiguracji tunelu"

            # Restart cloudflared to apply
            systemctl restart cloudflared 2>/dev/null \
                || systemctl restart cloudflared.service 2>/dev/null \
                || true
            sleep 2

            if systemctl is-active --quiet cloudflared 2>/dev/null; then
                log_ok "Cloudflare Tunnel zrestartowany"
            else
                log_warn "Cloudflare Tunnel nie został zrestartowany — zrób to ręcznie: systemctl restart cloudflared"
            fi
        fi
    else
        log_warn "Nie znaleziono konfiguracji tunelu cloudflared — pomiń lub skonfiguruj ręcznie"
        log_info "Oczekiwane lokalizacje: /etc/cloudflared/config.yml lub ~/.cloudflared/config.yml"
    fi
fi

# ==============================================================================
# STEP 15: Create systemd services
# ==============================================================================
log_step "Konfiguracja usług systemd"

NODE_BIN=$(command -v node || echo "/usr/bin/node")

# --- API service ---
log_info "Tworzenie overpanel-api.service..."
cat > /etc/systemd/system/overpanel-api.service << EOF
[Unit]
Description=OVERPANEL API (Fastify / Node.js 20)
Documentation=https://github.com/jurfader/overpanel
After=network.target mysql.service postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}/apps/api
ExecStart=${NODE_BIN} dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=overpanel-api
Environment=NODE_ENV=production
EnvironmentFile=${INSTALL_DIR}/apps/api/.env

[Install]
WantedBy=multi-user.target
EOF

# --- Web service ---
log_info "Tworzenie overpanel-web.service..."

# Detect server.js location (monorepo standalone layout vs flat)
WEB_STANDALONE_DIR="${INSTALL_DIR}/apps/web/.next/standalone"
if [[ -f "${WEB_STANDALONE_DIR}/apps/web/server.js" ]]; then
    WEB_WORK_DIR="${WEB_STANDALONE_DIR}"
    WEB_EXEC="apps/web/server.js"
else
    WEB_WORK_DIR="${INSTALL_DIR}/apps/web"
    WEB_EXEC=".next/standalone/server.js"
fi

cat > /etc/systemd/system/overpanel-web.service << EOF
[Unit]
Description=OVERPANEL Web (Next.js 15)
Documentation=https://github.com/jurfader/overpanel
After=network.target overpanel-api.service

[Service]
Type=simple
User=root
WorkingDirectory=${WEB_WORK_DIR}
ExecStart=${NODE_BIN} ${WEB_EXEC}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=overpanel-web
Environment=NODE_ENV=production
Environment=PORT=3333
Environment=HOSTNAME=0.0.0.0

[Install]
WantedBy=multi-user.target
EOF

# Reload daemon and enable / start services
log_info "Przeładowywanie systemd i uruchamianie usług..."
systemctl daemon-reload

systemctl enable overpanel-api overpanel-web > /dev/null 2>&1
systemctl restart overpanel-api  || log_warn "Nie można uruchomić overpanel-api (sprawdź: journalctl -u overpanel-api)"
systemctl restart overpanel-web  || log_warn "Nie można uruchomić overpanel-web (sprawdź: journalctl -u overpanel-web)"

# Wait for services to start (up to 10s)
for i in 1 2 3 4 5; do
    sleep 2
    API_STATUS=$(systemctl is-active overpanel-api 2>/dev/null || echo "unknown")
    WEB_STATUS=$(systemctl is-active overpanel-web 2>/dev/null || echo "unknown")
    [[ "$API_STATUS" == "active" && "$WEB_STATUS" == "active" ]] && break
done

API_STATUS=$(systemctl is-active overpanel-api 2>/dev/null || echo "unknown")
WEB_STATUS=$(systemctl is-active overpanel-web 2>/dev/null || echo "unknown")

[[ "$API_STATUS" == "active" ]] && log_ok "overpanel-api: active" || {
    log_warn "overpanel-api: ${API_STATUS}"
    log_warn "Ostatnie logi API:"
    journalctl -u overpanel-api -n 20 --no-pager 2>/dev/null | tail -15 | while read -r line; do log_warn "  $line"; done
}
[[ "$WEB_STATUS" == "active" ]] && log_ok "overpanel-web: active" || {
    log_warn "overpanel-web: ${WEB_STATUS}"
    log_warn "Ostatnie logi Web:"
    journalctl -u overpanel-web -n 20 --no-pager 2>/dev/null | tail -15 | while read -r line; do log_warn "  $line"; done
}

# ==============================================================================
# Final summary
# ==============================================================================
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║                                                      ║"
echo "  ║        OVERPANEL zainstalowany pomyślnie!            ║"
echo "  ║                                                      ║"
echo "  ╠══════════════════════════════════════════════════════╣"
printf "  ║  %-52s║\n" ""
printf "  ║  URL:     https://%-33s║\n" "${PANEL_DOMAIN}"
printf "  ║  Login:   %-42s║\n" "${ADMIN_EMAIL}"
printf "  ║  Hasło:   %-42s║\n" "${ADMIN_PASSWORD}"
printf "  ║  %-52s║\n" ""
echo "  ╠══════════════════════════════════════════════════════╣"
printf "  ║  %-52s║\n" ""
printf "  ║  MySQL root:      %-33s║\n" "${MYSQL_ROOT_PASS}"
printf "  ║  PostgreSQL user: overpanel / %-21s║\n" "${PG_PASS}"
printf "  ║  %-52s║\n" ""
echo "  ╠══════════════════════════════════════════════════════╣"
printf "  ║  %-52s║\n" ""
printf "  ║  Logi API:  journalctl -u overpanel-api -f%-9s║\n" ""
printf "  ║  Logi Web:  journalctl -u overpanel-web -f%-9s║\n" ""
printf "  ║  %-52s║\n" ""
echo "  ╠══════════════════════════════════════════════════════╣"
printf "  ║  %-52s║\n" ""
printf "  ║  ⚠  ZAPISZ TE DANE W BEZPIECZNYM MIEJSCU! %-9s║\n" ""
printf "  ║  %-52s║\n" ""
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
