import { writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { run, esc } from './shell.js'

const NGINX_SITES = '/etc/nginx/sites-available'
const NGINX_ENABLED = '/etc/nginx/sites-enabled'
const WWW_ROOT = '/var/www'

interface VhostOptions {
  domain: string
  documentRoot: string
  phpVersion: string
}

export async function createNginxVhost({ domain, documentRoot, phpVersion }: VhostOptions) {
  const safeDomain = esc(domain)
  const safePhp = esc(phpVersion)

  // Utwórz katalogi
  await mkdir(`${WWW_ROOT}/${safeDomain}/public`, { recursive: true })
  await mkdir(`${WWW_ROOT}/${safeDomain}/logs`, { recursive: true })

  // Utwórz index.html placeholder
  if (!existsSync(`${WWW_ROOT}/${safeDomain}/public/index.html`)) {
    await writeFile(
      `${WWW_ROOT}/${safeDomain}/public/index.html`,
      `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><title>${domain}</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px">
  <h1>🚀 ${domain}</h1>
  <p>Strona skonfigurowana przez OVERPANEL</p>
</body>
</html>`
    )
  }

  // Nginx config
  const config = generateNginxConfig({ domain: safeDomain, documentRoot, phpVersion: safePhp })
  const configPath = `${NGINX_SITES}/${safeDomain}`
  await writeFile(configPath, config)

  // Enable
  const enabledPath = `${NGINX_ENABLED}/${safeDomain}`
  if (!existsSync(enabledPath)) {
    await run(`ln -s ${configPath} ${enabledPath}`)
  }
}

export async function deleteNginxVhost(domain: string) {
  const safeDomain = esc(domain)
  try { await unlink(`${NGINX_ENABLED}/${safeDomain}`) } catch {}
  try { await unlink(`${NGINX_SITES}/${safeDomain}`) } catch {}
}

export async function reloadNginx() {
  await run('nginx -t') // Sprawdź konfigurację
  await run('systemctl reload nginx')
}

interface ProxyVhostOptions {
  domain: string
  externalPort: number
}

export async function createDockerProxyVhost({ domain, externalPort }: ProxyVhostOptions): Promise<void> {
  const safeDomain = esc(domain)

  const config = `server {
    listen 80;
    listen [::]:80;
    server_name ${safeDomain} www.${safeDomain};

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:${externalPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
}
`

  const configPath = `${NGINX_SITES}/${safeDomain}`
  await writeFile(configPath, config)

  const enabledPath = `${NGINX_ENABLED}/${safeDomain}`
  if (!existsSync(enabledPath)) {
    await run(`ln -s ${configPath} ${enabledPath}`)
  }
}

interface NodeVhostOptions {
  domain: string
  appPort: number
}

export async function createNginxNodeProxy({ domain, appPort }: NodeVhostOptions): Promise<void> {
  const safeDomain = esc(domain)

  await mkdir(`${WWW_ROOT}/${safeDomain}/logs`, { recursive: true })

  const config = `server {
    listen 80;
    listen [::]:80;
    server_name ${safeDomain} www.${safeDomain};

    access_log /var/www/${safeDomain}/logs/access.log;
    error_log  /var/www/${safeDomain}/logs/error.log;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:${appPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }

    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
}
`
  const configPath = `${NGINX_SITES}/${safeDomain}`
  await writeFile(configPath, config)

  const enabledPath = `${NGINX_ENABLED}/${safeDomain}`
  if (!existsSync(enabledPath)) {
    await run(`ln -s ${configPath} ${enabledPath}`)
  }
}

// ── OverCMS reverse-proxy vhost ──────────────────────────────────────────────

interface OverCmsProxyOptions {
  domain: string
  apiPort: number
  adminPort: number
  sitePort: number
}

export async function createNginxOverCmsProxy({ domain, apiPort, adminPort, sitePort }: OverCmsProxyOptions): Promise<void> {
  const safeDomain = esc(domain)

  const config = `server {
    listen 80;
    listen [::]:80;
    server_name ${safeDomain} www.${safeDomain};

    client_max_body_size 50M;

    # API backend
    location /api/ {
        proxy_pass http://127.0.0.1:${apiPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
        client_max_body_size 50M;
    }

    # Media uploads (served by API)
    location /uploads/ {
        proxy_pass http://127.0.0.1:${apiPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Admin panel (expects basePath: '/admin' in Next.js config)
    location /admin {
        proxy_pass http://127.0.0.1:${adminPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
    }

    # Client website (OverCMS site template)
    location / {
        proxy_pass http://127.0.0.1:${sitePort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
    }

    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
}
`

  const configPath = `${NGINX_SITES}/${safeDomain}`
  await writeFile(configPath, config)

  const enabledPath = `${NGINX_ENABLED}/${safeDomain}`
  if (!existsSync(enabledPath)) {
    await run(`ln -s ${configPath} ${enabledPath}`)
  }
}

function generateNginxConfig({ domain, documentRoot, phpVersion }: VhostOptions): string {
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain} www.${domain};

    root ${documentRoot};
    index index.php index.html index.htm;

    access_log /var/www/${domain}/logs/access.log;
    error_log  /var/www/${domain}/logs/error.log;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php${phpVersion}-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\\.ht {
        deny all;
    }

    location ~* \\.(jpg|jpeg|png|gif|ico|css|js|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
}
`
}

// ── OverCMS 2.0 (Bedrock / WordPress) PHP-FPM vhost ─────────────────────────

interface OverCms2VhostOptions {
  domain: string
  installDir: string   // np. /var/www/{domain}
  phpVersion: string   // np. 8.3
}

export async function createNginxOverCms2Vhost({ domain, installDir, phpVersion }: OverCms2VhostOptions): Promise<void> {
  const safeDomain = esc(domain)
  const safePhp = esc(phpVersion)
  // Nie używamy esc() na installDir, bo zawiera slashe — ograniczamy do alfanumerycznego komponentu domeny
  const documentRoot = `${installDir}/web`

  await mkdir(`${installDir}/logs`, { recursive: true })

  const config = `# OverCMS 2.0 (Bedrock layout) — generated by OVERPANEL
server {
    listen 80;
    listen [::]:80;
    server_name ${safeDomain} www.${safeDomain};

    root ${documentRoot};
    index index.php;

    access_log ${installDir}/logs/access.log;
    error_log  ${installDir}/logs/error.log;

    client_max_body_size 64M;

    # Hardening — ukryj pliki dotfiles. Bedrock trzyma vendor/ i config/
    # POZA document_root (/var/www/{domain}/web), więc nie wystawiamy do nich
    # specjalnych deny — sa fizycznie niedostepne. NIE mozemy uzywac
    # 'location ~ /vendor/' bo to regex bez kotwicy i pasowalby do
    # /wp/wp-includes/js/dist/vendor/react.min.js, blokujac wp-admin.
    location ~ /\\.(env|git|ht) { deny all; }

    # OverCMS URL masking — chowamy /wp/wp-admin/ za /admin/ i wp-login za /login.
    # rewrite ... last zachowuje oryginalny URL w pasku adresu (klient widzi /admin/),
    # a nginx wewnetrznie serwuje plik z /wp/wp-admin/. Bez blokowania /wp/wp-admin
    # bo WordPress robi canonical redirecty na te sciezke i blokada powoduje petle.
    location = /admin  { rewrite ^ /wp/wp-admin/    last; }
    location = /admin/ { rewrite ^ /wp/wp-admin/    last; }
    location = /login  { rewrite ^ /wp/wp-login.php last; }
    location ^~ /admin/ {
        rewrite ^/admin/(.*)\$ /wp/wp-admin/\$1 last;
    }

    # WordPress core (Bedrock instaluje WP w web/wp/)
    location / {
        try_files \$uri \$uri/ /index.php?\$args;
    }

    location ~ \\.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php${safePhp}-fpm.sock;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_read_timeout 300s;
        include fastcgi_params;
    }

    # Cache statycznych assetów
    location ~* \\.(jpg|jpeg|png|gif|ico|css|js|woff2?|svg|webp)\$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
        access_log off;
    }

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;
}
`

  const configPath = `${NGINX_SITES}/${safeDomain}`
  await writeFile(configPath, config)

  const enabledPath = `${NGINX_ENABLED}/${safeDomain}`
  if (!existsSync(enabledPath)) {
    await run(`ln -s ${configPath} ${enabledPath}`)
  }
}

// ── OVERCRM (Laravel 12) PHP-FPM vhost ──────────────────────────────────────

interface OverCrmVhostOptions {
  domain: string
  installDir: string   // np. /var/www/{domain}
  phpVersion: string   // np. 8.3
}

export async function createNginxOverCrmVhost({ domain, installDir, phpVersion }: OverCrmVhostOptions): Promise<void> {
  const safeDomain = esc(domain)
  const safePhp = esc(phpVersion)
  const documentRoot = `${installDir}/public`

  await mkdir(`${installDir}/logs`, { recursive: true })

  const config = `# OVERCRM (Laravel) — generated by OVERPANEL
server {
    listen 80;
    listen [::]:80;
    server_name ${safeDomain} www.${safeDomain};

    root ${documentRoot};
    index index.php;

    access_log ${installDir}/logs/access.log;
    error_log  ${installDir}/logs/error.log;

    client_max_body_size 64M;

    charset utf-8;

    # Laravel front-controller — wszystko niezdefiniowane idzie do public/index.php
    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    # Hardening — blok dotfiles, .env, .git
    location ~ /\\.(?!well-known).* { deny all; }

    # Laravel storage symlink (artisan storage:link)
    location ~ ^/storage/ {
        try_files \$uri =404;
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }

    # Cache statycznych assetów Vite buildu (resources/js + css → /build/)
    location ~* ^/build/.+\\.(js|css|woff2?|svg|webp|png|jpg|jpeg|gif|ico)\$ {
        expires 365d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Pozostałe assety statyczne
    location ~* \\.(jpg|jpeg|png|gif|ico|css|js|woff2?|svg|webp)\$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
        access_log off;
    }

    location ~ \\.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php${safePhp}-fpm.sock;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_read_timeout 300s;
        # Laravel potrzebuje większego buffer dla Inertia partial reload
        fastcgi_buffer_size 32k;
        fastcgi_buffers 8 32k;
        include fastcgi_params;
    }

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;
}
`

  const configPath = `${NGINX_SITES}/${safeDomain}`
  await writeFile(configPath, config)

  const enabledPath = `${NGINX_ENABLED}/${safeDomain}`
  if (!existsSync(enabledPath)) {
    await run(`ln -s ${configPath} ${enabledPath}`)
  }
}

// ── OpenClaw reverse-proxy vhost ────────────────────────────────────────────

interface OpenClawProxyOptions {
  domain: string
  gatewayPort: number
}

export async function createNginxOpenClawProxy({ domain, gatewayPort: _gp }: OpenClawProxyOptions): Promise<void> {
  // OpenClaw uses host network mode, always on port 18789
  const gatewayPort = 18789
  const safeDomain = esc(domain)

  const config = `server {
    listen 80;
    listen [::]:80;
    server_name ${safeDomain} www.${safeDomain};

    client_max_body_size 50M;

    # OpenClaw gateway — strip proxy headers so it sees localhost
    location / {
        proxy_pass http://127.0.0.1:${gatewayPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host localhost;
        proxy_set_header X-Forwarded-For "";
        proxy_set_header X-Real-IP "";
        proxy_set_header X-Forwarded-Proto "";
        proxy_set_header X-Forwarded-Host "";
        proxy_set_header Cf-Connecting-Ip "";
        proxy_set_header CF-Connecting-IP "";
        proxy_set_header Forwarded "";
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 300s;
    }
}
`

  const configPath = `${NGINX_SITES}/${safeDomain}`
  await writeFile(configPath, config)

  const enabledPath = `${NGINX_ENABLED}/${safeDomain}`
  if (!existsSync(enabledPath)) {
    await run(`ln -s ${configPath} ${enabledPath}`)
  }
}
