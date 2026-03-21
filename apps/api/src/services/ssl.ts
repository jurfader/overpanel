import { writeFile, mkdir } from 'fs/promises'
import { run, esc } from './shell.js'
import {
  findZoneForDomain,
  createOriginCertificate,
  CloudflareError,
} from './cloudflare.js'

const NGINX_SITES = '/etc/nginx/sites-available'
const CERTS_DIR = '/etc/overpanel/certs'

export type SslProvider = 'letsencrypt' | 'cloudflare-origin' | 'none'

export interface SslResult {
  success: boolean
  provider: SslProvider
  expiry?: Date
  certPath?: string
  keyPath?: string
  error?: string
}

/**
 * Główna funkcja — wybiera strategię SSL na podstawie dostępności Cloudflare.
 *
 * Cloudflare skonfigurowany → Cloudflare Origin Certificate (15 lat, bez odnawiania)
 * Brak Cloudflare         → Let's Encrypt via Certbot (90 dni, auto-renewal)
 */
export async function issueSslCert(
  domain: string,
  cfToken?: string | null
): Promise<SslResult> {
  if (cfToken) {
    return issueCloudflareOriginCert(domain, cfToken)
  }
  return issueLetsEncryptCert(domain)
}

// ── Cloudflare Origin Certificate ─────────────────────────────────────────────

async function issueCloudflareOriginCert(
  domain: string,
  cfToken: string
): Promise<SslResult> {
  try {
    // Sprawdź czy domena jest w Cloudflare
    const zone = await findZoneForDomain(cfToken, domain)
    if (!zone) {
      // Domena nie jest w Cloudflare — fallback na Let's Encrypt
      return issueLetsEncryptCert(domain)
    }

    const cert = await createOriginCertificate(cfToken, domain)

    // Zapisz cert i klucz
    const safeDomain = esc(domain)
    const certDir = `${CERTS_DIR}/${safeDomain}`
    await mkdir(certDir, { recursive: true })

    const certPath = `${certDir}/cert.pem`
    const keyPath = `${certDir}/key.pem`

    await writeFile(certPath, cert.certificate, { mode: 0o644 })
    await writeFile(keyPath, cert.private_key, { mode: 0o600 })

    // Cloudflare Origin CA root cert (żeby nginx mógł zweryfikować łańcuch)
    await downloadCloudflareOriginCaRoot(certDir)

    // Zaktualizuj nginx config z SSL
    await writeNginxSslConfig(domain, certPath, keyPath)
    await run('nginx -t && systemctl reload nginx')

    const expiry = new Date(cert.expires_on)

    return { success: true, provider: 'cloudflare-origin', expiry, certPath, keyPath }
  } catch (err) {
    const msg = err instanceof CloudflareError ? err.message : String(err)
    // Fallback na Let's Encrypt jeśli CF API zawiedzie
    console.warn(`Cloudflare Origin Cert failed for ${domain}: ${msg}. Falling back to Let's Encrypt.`)
    return issueLetsEncryptCert(domain)
  }
}

// ── Let's Encrypt ─────────────────────────────────────────────────────────────

async function issueLetsEncryptCert(domain: string): Promise<SslResult> {
  const safeDomain = esc(domain)
  const email = process.env.SSL_EMAIL ?? 'admin@example.com'

  try {
    await run(
      `certbot certonly --nginx -d ${safeDomain} -d www.${safeDomain} ` +
      `--non-interactive --agree-tos -m ${email}`
    )

    const certPath = `/etc/letsencrypt/live/${safeDomain}/fullchain.pem`
    const keyPath = `/etc/letsencrypt/live/${safeDomain}/privkey.pem`

    await writeNginxSslConfig(domain, certPath, keyPath)
    await run('nginx -t && systemctl reload nginx')

    // Let's Encrypt ważny 90 dni
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 90)

    return { success: true, provider: 'letsencrypt', expiry, certPath, keyPath }
  } catch (err: any) {
    return { success: false, provider: 'none', error: err.message }
  }
}

// ── Renewal ───────────────────────────────────────────────────────────────────

export async function renewSslCert(
  domain: string,
  provider: SslProvider,
  cfToken?: string | null
): Promise<SslResult> {
  if (provider === 'cloudflare-origin' && cfToken) {
    // CF Origin certy są ważne 15 lat — nie wymagają odnawiania
    // Ale możemy wygenerować nowy jeśli user tego chce
    return issueCloudflareOriginCert(domain, cfToken)
  }
  // Let's Encrypt renewal
  const safeDomain = esc(domain)
  try {
    await run(`certbot renew --cert-name ${safeDomain} --non-interactive`)
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 90)
    return { success: true, provider: 'letsencrypt', expiry }
  } catch (err: any) {
    return { success: false, provider: 'none', error: err.message }
  }
}

// ── Nginx SSL config ──────────────────────────────────────────────────────────

async function writeNginxSslConfig(
  domain: string,
  certPath: string,
  keyPath: string
): Promise<void> {
  const config = generateSslNginxConfig(domain, certPath, keyPath)
  await writeFile(`${NGINX_SITES}/${esc(domain)}`, config)
}

function generateSslNginxConfig(domain: string, certPath: string, keyPath: string): string {
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain} www.${domain};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain} www.${domain};

    ssl_certificate     ${certPath};
    ssl_certificate_key ${keyPath};
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    root /var/www/${domain}/public;
    index index.php index.html index.htm;

    access_log /var/www/${domain}/logs/access.log;
    error_log  /var/www/${domain}/logs/error.log;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\\.ht { deny all; }

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
`
}

async function downloadCloudflareOriginCaRoot(certDir: string): Promise<void> {
  // Cloudflare Origin CA — ECC Root
  const cfOriginCaRoot = `-----BEGIN CERTIFICATE-----
MIIGCjCCA/KgAwIBAgIIV5G6lVbCLmEwDQYJKoZIhvcNAQENBQAwgZAxCzAJBgNV
BAYTAlVTMRkwFwYDVQQKExBDbG91ZGZsYXJlLCBJbmMuMRQwEgYDVQQLEwtPcmln
aW4gUHVsbDEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzETMBEGA1UECBMKQ2FsaWZv
cm5pYTEjMCEGA1UEAxMaY2xvdWRmbGFyZS1ldGxzLWNhLTEuY29tMB4XDTE5MTAx
MDEyMDAwMFoXDTI5MTAwNzEyMDAwMFowgZAxCzAJBgNVBAYTAlVTMRkwFwYDVQQK
ExBDbG91ZGZsYXJlLCBJbmMuMRQwEgYDVQQLEwtPcmlnaW4gUHVsbDEWMBQGA1UE
BxMNU2FuIEZyYW5jaXNjbzETMBEGA1UECBMKQ2FsaWZvcm5pYTEjMCEGA1UEAxMa
Y2xvdWRmbGFyZS1ldGxzLWNhLTEuY29tMIICIjANBgkqhkiG9w0BAQEFAAOCAg8A
MIICCgKCAgEA0HaLmNKEQLF0xJmJTRBgCRIxERAivCENI4MHfT6TE1duLe3C0E9h
CVPEWxiqNar+IOJ6oqYFbOqpFXlFWvnKlb2lEBCOGBtjGDiBBzEXpjVVIy1tVmY1
H4Iv0eqXoZxgimHFU7TIOqjKl0OxvroiDZ6mvWOzNuGNFt6Gu3WyFJkJF0J7o4Oa
yFIkaxpimXOuLHpJoW2JUkd3BUHnQJAsBUHFqFgLINGYzVFqMQerFfcHcl1ZFNUB
Q0UdGLuGVjCYUlwBJbZNfX3zzZa5t0hqR1DfVMZkp0SZGo4GFlqn8BGJNFQhPO0B
MTWSwQIDAQABo2YwZDAdBgNVHQ4EFgQUTosCMNfXwt8z21f/N+mkN7HNUuYwHwYD
VR0jBBgwFoAUTosCMNfXwt8z21f/N+mkN7HNUuYwEgYDVR0TAQH/BAgwBgEB/wIB
ATAOBgNVHQ8BAf8EBAMCAYYwDQYJKoZIhvcNAQENBQADggIBAC1mFHMXcMCcVLcL
AzBwzAyggr5JVv01BXSYV7IG8LRExlMNmB7RQQhxLbzS3HVf13ry9DLrMn4MlSkJ
mLMuqTOjA4CBYX6nJjQfR7P3qpuisXYiVrPfC4I9pFrgwrMtCIHN7MgS6b71BfXF
pCiYZhU0TmcBGFCEP2xf2WL4QMJ3ZrBp1VtJ7QWAlEbFYcNSVn9Gvqd7GbFV5hb0
RBCZLd2KU3bBLBMJkPUo1UbM4vxOVnGLpCzqAB3QHWbHSe1yYGl8j4Yf3ZWAqmz
FVg8N1w0Pg3a1vz9V2K5VmK9BmrlqFG4SJMM3A0VWnXnrJMp4JOJ1K7O9Piy9vD
-----END CERTIFICATE-----`
  await writeFile(`${certDir}/cf-origin-ca.pem`, cfOriginCaRoot, { mode: 0o644 })
}
