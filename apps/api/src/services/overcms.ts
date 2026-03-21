/**
 * OverCMS Docker Compose installer
 *
 * Each OverCMS instance is cloned into /opt/overcms-sites/<domain>/app
 * and gets a unique set of ports so multiple installs can coexist.
 */

import { run } from './shell.js'
import { randomBytes } from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'

const execAsync = promisify(exec)

const OVERCMS_REPO = 'https://github.com/jurfader/over-cms.git'
const OVERCMS_BASE_DIR = '/opt/overcms-sites'
const INSTALL_STATUS_DIR = '/tmp'

// ── Install status helpers ──────────────────────────────────────────────────

export interface InstallStatus {
  status: 'running' | 'success' | 'failed'
  step: string
  log: string[]
  startedAt: string
  completedAt?: string
}

function statusFile(domain: string): string {
  return `${INSTALL_STATUS_DIR}/overcms-install-${domain.replace(/[^a-z0-9.-]/g, '')}.json`
}

async function writeInstallStatus(domain: string, data: InstallStatus): Promise<void> {
  await writeFile(statusFile(domain), JSON.stringify(data, null, 2), 'utf-8')
}

export async function readInstallStatus(domain: string): Promise<InstallStatus | null> {
  const f = statusFile(domain)
  if (!existsSync(f)) return null
  try {
    return JSON.parse(await readFile(f, 'utf-8'))
  } catch {
    return null
  }
}

function generatePassword(len = 24): string {
  return randomBytes(len).toString('base64url').slice(0, len)
}

/** Run a shell command with a custom timeout (ms). */
async function runLong(command: string, timeout = 600_000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(command, { timeout })
  } catch (err: any) {
    throw new Error(`Command failed: ${command}\n${err.stderr ?? err.message}`)
  }
}

// Get next available port range (each OverCMS install needs ~8 ports)
async function getNextPortBase(): Promise<number> {
  // Start at 10000, each install uses 10 ports (with padding)
  const { stdout } = await run(`ls ${OVERCMS_BASE_DIR} 2>/dev/null | wc -l`).catch(() => ({ stdout: '0', stderr: '' }))
  const count = parseInt(stdout.trim()) || 0
  return 10000 + (count * 10)
}

export interface OverCmsInstallOptions {
  domain: string
  adminEmail: string
  adminPassword: string
  licenseKey?: string
  ghToken?: string // for private repo access
}

export async function installOverCms(options: OverCmsInstallOptions): Promise<{
  apiUrl: string
  adminUrl: string
  apiPort: number
  adminPort: number
}> {
  const { domain, adminEmail, adminPassword, licenseKey, ghToken } = options
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${OVERCMS_BASE_DIR}/${safeDomain}`
  const portBase = await getNextPortBase()

  const apiPort = portBase
  const adminPort = portBase + 1
  const licensePort = portBase + 2
  const portalPort = portBase + 4
  const pgPort = portBase + 5
  const redisPort = portBase + 6
  const minioPort = portBase + 7

  const pgPassword = generatePassword()
  const redisPassword = generatePassword()
  const minioPassword = generatePassword()
  const authSecret = generatePassword(64)
  const licenseAdminSecret = generatePassword(32)

  const containerPrefix = safeDomain.replace(/\./g, '-')

  const log: string[] = []
  const startedAt = new Date().toISOString()

  async function logStep(step: string, fn: () => Promise<void>): Promise<void> {
    log.push(`> ${step}`)
    await writeInstallStatus(domain, { status: 'running', step, log, startedAt })
    try {
      await fn()
      log.push(`✓ ${step}`)
      await writeInstallStatus(domain, { status: 'running', step, log, startedAt })
    } catch (err: any) {
      // Show meaningful error detail in log
      const msg = err.message || String(err)
      const lines = msg.split('\n').filter((l: string) => l.trim())
      for (const line of lines.slice(0, 10)) {
        log.push(`  ${line}`)
      }
      log.push(`✗ ${step}`)
      await writeInstallStatus(domain, { status: 'failed', step, log, startedAt, completedAt: new Date().toISOString() })
      throw err
    }
  }

  // 1. Clean up previous install (containers + volumes + directory)
  await logStep('Czyszczenie poprzedniej instalacji', async () => {
    const dc = `cd ${installDir}/app && docker compose -f docker-compose.prod.yml -f docker-compose.override.yml`
    await runLong(`${dc} down -v 2>/dev/null || true`, 60_000)
    await run(`rm -rf ${installDir}`)
    await run(`mkdir -p ${installDir}`)
  })

  // 2. Clone repo with GitHub token
  await logStep('Klonowanie repozytorium OverCMS', async () => {
    const token = ghToken || process.env.GH_TOKEN || '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'
    const cloneUrl = OVERCMS_REPO.replace('https://', `https://${token}@`)
    await runLong(`git clone ${cloneUrl} ${installDir}/app`)
  })

  // 3. Generate .env
  const envContent = `
# OverCMS — Generated by OVERPANEL
# Domain: ${domain}

# Database
DATABASE_URL=postgresql://overcms:${pgPassword}@postgres:5432/overcms
POSTGRES_USER=overcms
POSTGRES_PASSWORD=${pgPassword}
POSTGRES_DB=overcms

# Redis
REDIS_URL=redis://:${redisPassword}@redis:6379
REDIS_PASSWORD=${redisPassword}

# S3 / MinIO
MINIO_ROOT_USER=overcms-minio
MINIO_ROOT_PASSWORD=${minioPassword}
S3_ENDPOINT=http://minio:9000
S3_REGION=auto
S3_ACCESS_KEY_ID=overcms-minio
S3_SECRET_ACCESS_KEY=${minioPassword}
S3_BUCKET=overcms
S3_PUBLIC_URL=https://${domain}/storage

# API
API_PORT=3000
API_URL=http://api:3000
API_DOMAIN=${domain}
BETTER_AUTH_SECRET=${authSecret}
BETTER_AUTH_URL=https://${domain}
ADMIN_CORS_ORIGINS=https://${domain}

# Admin
ADMIN_DOMAIN=${domain}
NEXT_PUBLIC_API_URL=https://${domain}

# License — centralny serwer licencji (nie lokalny kontener)
LICENSE_SERVER_URL=https://license.overcms.pl
OVERCMS_LICENSE_KEY=${licenseKey || ''}
OVERCMS_INSTALL_ID=${randomBytes(16).toString('hex')}
SITE_URL=https://${domain}

# Portal
PORTAL_DOMAIN=${domain}

# SSL
ACME_EMAIL=${adminEmail}
`.trim()

  await logStep('Generowanie konfiguracji .env', async () => {
    await run(`cat > ${installDir}/app/.env << 'ENVEOF'
${envContent}
ENVEOF`)
  })

  // 4. Create custom docker-compose.override.yml (no Traefik, expose ports directly)
  const composeOverride = `
version: "3.8"
services:
  postgres:
    container_name: overcms-pg-${containerPrefix}
    ports:
      - "${pgPort}:5432"
  redis:
    container_name: overcms-redis-${containerPrefix}
    ports:
      - "${redisPort}:6379"
  minio:
    container_name: overcms-minio-${containerPrefix}
    ports:
      - "${minioPort}:9000"
  api:
    container_name: overcms-api-${containerPrefix}
    ports:
      - "${apiPort}:3000"
  admin:
    container_name: overcms-admin-${containerPrefix}
    build:
      args:
        NEXT_PUBLIC_API_URL: https://${domain}
    ports:
      - "${adminPort}:3001"
  license-server:
    profiles: ["disabled"]
  portal:
    profiles: ["disabled"]
  traefik:
    profiles: ["disabled"]
`.trim()

  await logStep('Generowanie docker-compose.override.yml', async () => {
    await run(`cat > ${installDir}/app/docker-compose.override.yml << 'COMPEOF'
${composeOverride}
COMPEOF`)
  })

  const dc = `cd ${installDir}/app && docker compose -f docker-compose.prod.yml -f docker-compose.override.yml`

  // 5. Build and start containers (long timeout — Docker builds are slow)
  await logStep('Budowanie obrazów Docker (może potrwać kilka minut...)', async () => {
    await runLong(`${dc} build`, 600_000)
  })

  await logStep('Uruchamianie kontenerów', async () => {
    await runLong(`${dc} up -d`, 120_000)
  })

  // 6. Wait for PostgreSQL to be healthy (poll instead of fixed sleep)
  await logStep('Oczekiwanie na gotowość bazy danych', async () => {
    const pgContainer = `overcms-pg-${containerPrefix}`
    for (let i = 0; i < 30; i++) {
      try {
        const { stdout } = await run(`docker exec ${pgContainer} pg_isready -U overcms 2>/dev/null`)
        if (stdout.includes('accepting connections')) break
      } catch {}
      await new Promise(r => setTimeout(r, 2000))
    }
  })

  // 7. Run database migration and seed (no silent catch — errors must be visible)
  await logStep('Migracja bazy danych', async () => {
    await runLong(`${dc} exec -T api npx drizzle-kit push`)
  })

  await logStep('Tworzenie konta admina', async () => {
    await runLong(`${dc} exec -T -e ADMIN_EMAIL=${adminEmail} -e ADMIN_PASSWORD=${adminPassword} api npx tsx packages/core/src/db/seed.ts`)
  })

  // 8. Store port mapping
  await logStep('Zapisywanie konfiguracji portów', async () => {
    await run(`cat > ${installDir}/ports.json << 'EOF'
{"apiPort":${apiPort},"adminPort":${adminPort},"licensePort":${licensePort},"portalPort":${portalPort},"pgPort":${pgPort},"redisPort":${redisPort},"minioPort":${minioPort}}
EOF`)
  })

  log.push('✓ Instalacja OverCMS zakończona pomyślnie!')
  await writeInstallStatus(domain, { status: 'success', step: 'done', log, startedAt, completedAt: new Date().toISOString() })

  return {
    apiUrl: `http://localhost:${apiPort}`,
    adminUrl: `http://localhost:${adminPort}`,
    apiPort,
    adminPort,
  }
}

export async function uninstallOverCms(domain: string): Promise<void> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${OVERCMS_BASE_DIR}/${safeDomain}`

  // Stop and remove containers
  await runLong(`cd ${installDir}/app && docker compose -f docker-compose.prod.yml -f docker-compose.override.yml down -v 2>/dev/null || true`)

  // Remove directory
  await run(`rm -rf ${installDir}`)
}

export async function isOverCmsRunning(domain: string): Promise<boolean> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const containerName = `overcms-api-${safeDomain.replace(/\./g, '-')}`
  try {
    const { stdout } = await run(`docker inspect -f '{{.State.Running}}' ${containerName} 2>/dev/null`)
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}
