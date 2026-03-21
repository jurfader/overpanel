# OVERPANEL — Plan Rozwoju

> Panel hostingowy VPS dla Ubuntu. Multi-user, Nginx, MySQL/PostgreSQL, Cloudflare DNS, WordPress auto-installer.
> Aktualizuj status: `[ ]` = do zrobienia, `[x]` = gotowe, `[~]` = w trakcie

---

## FAZA 0 — Fundament projektu

### 0.1 Monorepo & Tooling
- [x] Stworzenie struktury monorepo (apps/web, apps/api, packages/db, packages/shared)
- [x] Konfiguracja TypeScript (tsconfig bazowy + per-app)
- [x] ESLint + Prettier
- [x] pnpm workspaces

### 0.2 Design System
- [x] Paleta kolorów: pink `#E91E8C` + purple `#9B26D9` + dark `#0A0A0F`
- [x] Glassmorphism komponenty bazowe (Card, Button, Input, Badge)
- [x] Sidebar + layout panelu
- [x] Typografia + spacing scale
- [x] Animacje (Framer Motion — page transitions, hover effects)
- [x] Responsywność (mobile-friendly)

---

## FAZA 1 — Core systemu

### 1.1 Backend — Fastify API
- [x] Setup Fastify + TypeScript
- [x] Prisma ORM + schemat bazy danych (Users, Sites, Databases, SSLCerts, CronJobs, Backups, DNSRecords)
- [x] JWT autentykacja (login, refresh token, logout)
- [x] Role-based access control: `admin` / `client`
- [x] Middleware: auth guard, rate limiting
- [x] Socket.io — real-time system stats (systeminformation)
- [x] Routes: auth, sites, databases, users, system

### 1.2 Frontend — Next.js 15
- [x] Setup Next.js 15 + TypeScript + Tailwind CSS
- [x] shadcn/ui z customowym theme (pink/purple)
- [x] Routing: `(auth)`, `(panel)`
- [x] API client (fetch wrapper + typy)
- [x] Store (Zustand — user session)

### 1.3 Autentykacja
- [x] Strona logowania (glassmorphism design)
- [x] JWT w httpOnly cookie
- [x] Middleware Next.js (ochrona tras)
- [x] Strona profilu / zmiana hasła

---

## FAZA 2 — Dashboard

### 2.1 System Stats (real-time)
- [x] Backend: Socket.io emitter — CPU, RAM, dysk, sieć (co 2s)
- [x] Widget CPU (wykres area — ostatnie 30 odczytów)
- [x] Widget RAM (wykres area)
- [x] Widget dysk (progress bar)
- [x] Widget sieć (in/out MB/s)
- [x] Widget uptime serwera
- [x] Widget liczba stron / baz / użytkowników

### 2.2 Aktywność
- [x] Lista ostatnich akcji w systemie (audit log — UI)
- [x] Powiadomienia (expiry SSL, niski dysk, błędy)

---

## FAZA 3 — Zarządzanie stronami WWW

### 3.1 Nginx vhosty
- [x] Lista stron (admin: wszystkie, klient: swoje) — API
- [x] Tworzenie strony: domena, PHP version, root dir, użytkownik systemowy — API
- [x] Generator konfiguracji Nginx (template engine) — service
- [x] Reload/restart Nginx z panelu — API
- [x] Usuwanie strony (+ cleanup Nginx, katalogów) — API
- [x] Status strony (aktywna / nieaktywna) — API
- [x] UI — formularz tworzenia strony
- [x] UI — lista stron z akcjami

### 3.2 PHP
- [x] Wykrywanie zainstalowanych wersji PHP
- [x] Wybór wersji PHP per strona (PHP-FPM pools)
- [x] Podstawowe ustawienia PHP (upload_max, memory_limit itd.)

### 3.3 Node.js / Python (bonus)
- [x] Reverse proxy przez Nginx do portu aplikacji
- [x] Start/stop/restart aplikacji (PM2 integration)

---

## FAZA 4 — SSL

- [x] Auto-issue Let's Encrypt (Certbot) przy tworzeniu strony — service
- [x] Lista certyfikatów (domena, data wygaśnięcia, status) — UI
- [x] Ręczne odnowienie certyfikatu — service
- [x] Auto-renewal (cron systemowy)
- [x] Wgraj własny certyfikat (custom SSL)
- [x] Redirect HTTP → HTTPS — nginx template

---

## FAZA 5 — Bazy danych

### 5.1 MySQL
- [x] Lista baz MySQL (filtr per user) — API
- [x] Tworzenie bazy + użytkownika DB + nadawanie uprawnień — service
- [x] Reset hasła użytkownika DB — service
- [x] Usuwanie bazy — service
- [x] Export (dump SQL) — service
- [x] Import (wgranie SQL)

### 5.2 PostgreSQL
- [x] Lista baz PostgreSQL — API
- [x] Tworzenie bazy + użytkownika — service
- [x] Reset hasła — service
- [x] Usuwanie bazy — service
- [x] Export / Import — service

### 5.3 UI
- [x] Zakładki MySQL / PostgreSQL
- [x] Podgląd rozmiaru bazy
- [x] Informacje o połączeniu (host, port, user)

---

## FAZA 6 — WordPress Auto-Installer

- [x] Sprawdzenie wymagań (WP-CLI detection)
- [x] Formularz: domena, tytuł, admin WP, email, hasło, wybór bazy (MySQL/PG), język
- [x] Automatyczne: pobranie WP, konfiguracja `wp-config.php`, instalacja, usunięcie pliku install
- [x] Opcje: język (pl_PL, en_US, de_DE, fr_FR, es_ES)
- [x] Lista instalacji WordPress (wersja, link do wp-admin)
- [x] Aktualizacja WP (WP-CLI)
- [x] Usuwanie WP z zachowaniem bazy
- [x] Kopia zapasowa przed aktualizacją
- [x] Motyw startowy (opcja)

---

## FAZA 7 — Użytkownicy (Multi-tenant)

- [x] Lista użytkowników (admin)
- [x] Tworzenie użytkownika: email, hasło, nazwa firmy
- [x] Przypisywanie stron do użytkownika
- [x] Przypisywanie baz danych do użytkownika
- [x] Blokowanie / odblokowanie konta
- [x] Klient widzi tylko swoje zasoby (RLS na poziomie API)
- [x] Panel klienta — uproszczony widok (strony, bazy, DNS, logi)

---

## FAZA 8 — DNS / Cloudflare

- [x] Konfiguracja Cloudflare API Token (per user, z weryfikacją)
- [x] Lista stref CF dostępnych dla tokenu
- [x] Pobieranie rekordów DNS z Cloudflare API
- [x] Dodawanie rekordów (A, AAAA, CNAME, MX, TXT, CAA)
- [x] Edycja rekordów (inline)
- [x] Usuwanie rekordów
- [x] Przełącznik proxy Cloudflare (pomarańcza / szara chmurka)
- [x] Auto-dodanie rekordu A przy tworzeniu strony
- [x] Auto-dodawanie/usuwanie domen z konfiguracji tunelu cloudflared

### SSL inteligentna detekcja (nowa funkcja)
- [x] cloudflared aktywny → brak lokalnego SSL (Cloudflare Edge obsługuje HTTPS)
- [x] Cloudflare połączony → Cloudflare Origin Certificate (15 lat, brak odnawiania)
- [x] Brak Cloudflare → Let's Encrypt via Certbot (90 dni, auto-renewal)
- [x] Fallback: jeśli CF Origin Cert zawiedzie → Let's Encrypt

---

## FAZA 9 — Firewall (UFW)

- [x] Podgląd aktualnych reguł UFW
- [x] Dodawanie reguły (port, protokół, akcja: allow/deny, IP source)
- [x] Usuwanie reguły
- [x] Włączanie / wyłączanie UFW
- [x] Predefiniowane reguły (HTTP 80, HTTPS 443, SSH 22)

---

## FAZA 10 — Menedżer plików

- [x] Przeglądanie katalogów (z ograniczeniem do `/var/www` dla klientów)
- [x] Upload plików (base64)
- [x] Download plików
- [x] Tworzenie folderów
- [x] Usuwanie plików / folderów
- [x] Edytor tekstowy (kod PHP/HTML/JS/CSS)
- [x] Zmiana uprawnień (chmod)
- [x] Przenoszenie / zmiana nazwy plików

---

## FAZA 11 — Cron Jobs

- [x] Lista cron jobów per strona / użytkownik
- [x] Tworzenie crona (wyrażenie cron + komenda)
- [x] Edycja / usuwanie
- [x] Ostatnie wykonanie + status
- [x] Logi wykonań crona
- [x] Kreator wizualny (co minutę / co godzinę / co dzień itd.)

---

## FAZA 12 — Backup

- [x] Konfiguracja harmonogramu backupów (per strona)
- [x] Backup plików (tar.gz) + bazy danych (dump)
- [x] Lista kopii zapasowych (data, rozmiar)
- [x] Pobieranie backupu
- [x] Przywracanie backupu
- [x] Przechowywanie lokalne S3/Backblaze B2
- [x] Retencja (ile dni trzymać)

---

## FAZA 13 — Logi

- [x] Logi dostępu Nginx per strona (real-time tail)
- [x] Logi błędów Nginx per strona
- [x] Logi PHP-FPM
- [x] Logi systemowe (journald)
- [x] Filtrowanie logów (search, level)
- [x] Pobieranie logów

---

## FAZA 14 — FTP/SFTP

- [x] Tworzenie użytkownika FTP (pure-ftpd)
- [x] Przypisanie do katalogu strony
- [x] Reset hasła FTP
- [x] Lista użytkowników FTP
- [x] Usuwanie użytkownika FTP

---

## FAZA 15 — Jednokomendowy Instalator

- [x] Skrypt `install.sh` — interaktywny wizard
  - [x] Wykrycie systemu (Ubuntu 20/22/24)
  - [x] Pytania: domena panelu, email admina, hasło admina, CF API token
  - [x] Instalacja zależności: Node.js 20, pnpm, Nginx, MySQL 8, PostgreSQL 16, PHP 8.3, WP-CLI, Certbot, UFW
  - [x] Konfiguracja Nginx dla panelu
  - [x] Konfiguracja bazy danych panelu
  - [x] Build i deploy OVERPANEL
  - [x] Wystawienie SSL dla domeny panelu
  - [x] Konfiguracja systemd service (auto-start)
  - [x] Podsumowanie: URL panelu + dane logowania
- [x] Skrypt update.sh — aktualizacja panelu
- [x] Skrypt uninstall.sh — czysty deinstalator

---

## FAZA 16 — Ustawienia panelu

- [x] Dane panelu (nazwa, URL)
- [x] SMTP — konfiguracja maila
- [x] Limity per użytkownik (max stron, max baz)
- [x] Logo, favicon
- [x] Cloudflare API Token (globalny)
- [x] Backup S3/B2 credentials
- [x] Logi audytu (kto co zrobił i kiedy)

---

## FAZA 17 — Docker

- [x] Prisma model `DockerContainer` (name, image, domain, ports, template, envVars, volumes)
- [x] Docker service: isDockerAvailable, listContainers, lifecycle (start/stop/restart/remove), logs, pullImage, createAndStartContainer, findAvailablePort
- [x] Szablony aplikacji: Ghost, Gitea, Nextcloud, Uptime Kuma, n8n, Vaultwarden, Plausible, Mattermost, Custom
- [x] API routes: GET status, GET templates, GET containers, POST deploy, POST start/stop/restart, DELETE, GET logs
- [x] Deploy flow: auto-port → pull image → create container → nginx proxy → cloudflared tunnel
- [x] UI — lista kontenerów (status dot, start/stop/restart/delete/logs)
- [x] UI — modal wdrożenia (2-etap: wybór szablonu → konfiguracja env vars + domena)
- [x] UI — podgląd logów (terminal-style, auto-refresh)
- [x] Sidebar: Docker w sekcji Narzędzia
- [x] install.sh — Docker Engine installation step
- [x] Docker Compose support
- [x] Resource limits (CPU/RAM per container)
- [x] Container rebuild / image update
- [x] Docker dostępny tylko dla administratorów

---

## FAZA 19 — System aktualizacji

- [x] Sprawdzanie dostępnych aktualizacji (git fetch + log)
- [x] Wyświetlanie changelog (lista commitów)
- [x] Jednoklinkowa aktualizacja z panelu (git pull + build + restart)
- [x] Live log aktualizacji (polling co 2s)
- [x] Status aktualizacji (running/success/failed)
- [x] Strona /update w panelu (admin only)

---

## FAZA 18 — Terminal

- [x] WebSocket terminal (Socket.io namespace `/terminal`)
- [x] PTY via node-pty (pełna interaktywność bash)
- [x] xterm.js frontend (kolory, resize, scrollback)
- [x] Terminal dostępny tylko dla administratorów
- [x] Fullscreen mode, OVERPANEL theme (pink cursor)

---

## Legenda statusów
- `[ ]` — Do zrobienia
- `[~]` — W trakcie
- `[x]` — Gotowe
- `[!]` — Zablokowane / problem

---

*Ostatnia aktualizacja: 2026-03-21*
