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
  portalPort: number
}

export async function createNginxOverCmsProxy({ domain, apiPort, adminPort, portalPort }: OverCmsProxyOptions): Promise<void> {
  const safeDomain = esc(domain)

  const config = `server {
    listen 80;
    listen [::]:80;
    server_name ${safeDomain} www.${safeDomain};

    client_max_body_size 50M;

    # Portal API routes (must be before /api/ catch-all)
    location /api/check-license {
        proxy_pass http://127.0.0.1:${portalPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

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

    # Admin panel — strip /admin prefix so Next.js receives /
    location /admin/ {
        proxy_pass http://127.0.0.1:${adminPort}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
    }
    location = /admin {
        return 301 /admin/;
    }

    # Public website (portal)
    location / {
        proxy_pass http://127.0.0.1:${portalPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
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
