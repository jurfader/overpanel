/**
 * OverCMS 2.0 (WordPress / Bedrock) installer
 *
 * Każda instancja jest instalowana w /var/www/{domain}/, a Nginx vhost serwuje
 * /var/www/{domain}/web/ jako document root (Bedrock layout).
 *
 * Tryby pobierania źródła:
 *   1. ZIP z GitHub Releases (jeśli OVERCMS2_RELEASE_URL ustawione lub `latest` dostępny)
 *   2. Fallback: git clone + composer install + (panel/dist gotowy w repo lub npm build)
 */

import { run, esc, sq } from './shell.js'
import { randomBytes } from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

const OVERCMS2_REPO = 'https://github.com/jurfader/OverCMS-2.0.git'
const OVERCMS2_RELEASES_API = 'https://api.github.com/repos/jurfader/OverCMS-2.0/releases/latest'
const WWW_ROOT = '/var/www'
const INSTALL_STATUS_DIR = '/tmp'

// ── Install status helpers (kompatybilne z routes/sites.ts install-status) ──

export interface InstallStatus {
  status: 'running' | 'success' | 'failed'
  step: string
  log: string[]
  startedAt: string
  completedAt?: string
}

function statusFile(domain: string): string {
  return `${INSTALL_STATUS_DIR}/overcms2-install-${domain.replace(/[^a-z0-9.-]/g, '')}.json`
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

/** Run shell command with custom timeout. */
async function runLong(command: string, timeout = 600_000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(command, { timeout, maxBuffer: 32 * 1024 * 1024 })
  } catch (err: any) {
    const details = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n')
    throw new Error(`Command failed: ${command}\n${details}`)
  }
}

export interface OverCms2InstallOptions {
  domain: string
  adminUser: string
  adminEmail: string
  adminPassword: string
  siteTitle?: string
}

export interface OverCms2InstallResult {
  installDir: string
  documentRoot: string
  dbName: string
  dbUser: string
  panelUrl: string
}

/**
 * Główny installer. Wykonuje:
 *  1. Cleanup poprzedniej instalacji
 *  2. Pobranie źródła (ZIP latest / git clone fallback)
 *  3. Composer install (jeśli vendor/ nie ma)
 *  4. Sprawdzenie/build React panelu (jeśli panel/dist nie ma)
 *  5. Utworzenie bazy MySQL
 *  6. Uruchomienie installer/install.sh w trybie --non-interactive
 *  7. Permissions (www-data)
 */
export async function installOverCms2(options: OverCms2InstallOptions): Promise<OverCms2InstallResult> {
  const { domain, adminUser, adminEmail, adminPassword, siteTitle } = options
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')

  if (!safeDomain || safeDomain !== domain) {
    throw new Error(`Niepoprawna domena: ${domain}`)
  }
  if (!/^[A-Za-z0-9_.@-]+$/.test(adminUser)) {
    throw new Error(`Niepoprawny login admina: ${adminUser}`)
  }
  if (adminPassword.length < 8) {
    throw new Error('Hasło administratora musi mieć min. 8 znaków')
  }

  // db_name max 64 znaki, musi pasować do regex w installerze
  const dbBase = ('ocms_' + safeDomain.replace(/[^a-z0-9]/g, '_')).slice(0, 60)
  const dbName = dbBase
  const dbUser = dbBase.slice(0, 32)
  const dbPass = generatePassword(28)

  const installDir = `${WWW_ROOT}/${safeDomain}`
  const documentRoot = `${installDir}/web`

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
      const msg = err.message || String(err)
      const lines = msg.split('\n').filter((l: string) => l.trim())
      for (const line of lines.slice(-15)) {
        log.push(`  ${line}`)
      }
      log.push(`✗ ${step}`)
      await writeInstallStatus(domain, {
        status: 'failed',
        step,
        log,
        startedAt,
        completedAt: new Date().toISOString(),
      })
      throw err
    }
  }

  // 1. Cleanup
  await logStep('Czyszczenie poprzedniej instalacji', async () => {
    await run(`rm -rf ${esc(installDir)}`)
    await run(`mkdir -p ${esc(installDir)}`)
  })

  // 2. Source: try ZIP from GitHub Releases first, fallback to git clone
  let usedSource: 'zip' | 'git' = 'zip'

  await logStep('Pobieranie OverCMS 2.0 (najnowszy release)', async () => {
    let zipUrl: string | null = null
    try {
      const { stdout } = await runLong(
        `curl -fsSL -H 'Accept: application/vnd.github+json' ${OVERCMS2_RELEASES_API}`,
        30_000
      )
      const release = JSON.parse(stdout)
      const asset = (release.assets ?? []).find((a: any) => typeof a?.name === 'string' && a.name.endsWith('.zip'))
      zipUrl = asset?.browser_download_url ?? null
    } catch {
      zipUrl = null
    }

    if (!zipUrl) {
      throw new Error('No release ZIP available')
    }

    const tmp = `/tmp/overcms2-${safeDomain}-${Date.now()}.zip`
    await runLong(`curl -fsSL -o ${esc(tmp)} ${sq(zipUrl)}`, 300_000)
    await runLong(`unzip -q ${esc(tmp)} -d ${esc(installDir)}.unpack`, 120_000)
    // ZIP rozpakowuje się do podkatalogu typu overcms-v1.0.0/ — przesuń jego zawartość
    const { stdout: lsOut } = await run(`ls -1 ${esc(installDir)}.unpack | head -1`)
    const inner = lsOut.trim()
    if (!inner) throw new Error('ZIP unpacked to empty directory')
    await run(`shopt -s dotglob; mv ${esc(installDir)}.unpack/${esc(inner)}/* ${esc(installDir)}/ 2>/dev/null || mv ${esc(installDir)}.unpack/${esc(inner)}/* ${esc(installDir)}/`)
    await run(`rm -rf ${esc(installDir)}.unpack ${esc(tmp)}`)
  }).catch(async (zipErr) => {
    // Fallback do git clone
    usedSource = 'git'
    log.push(`  ZIP nieosiągalny, fallback do git clone (${zipErr.message?.slice(0, 80) ?? 'unknown'})`)
    await logStep('Klonowanie repo OverCMS 2.0 (fallback)', async () => {
      await run(`rm -rf ${esc(installDir)} && mkdir -p ${esc(installDir)}`)
      await runLong(`git clone --depth 1 ${OVERCMS2_REPO} ${esc(installDir)}`, 300_000)
    })
  })

  // 3. Composer install (jeśli vendor/ nie ma — czyli przy git clone)
  await logStep('Instalacja zależności Composer', async () => {
    if (existsSync(`${installDir}/vendor/autoload.php`)) {
      log.push('  vendor/ już istnieje — pomijam')
      return
    }
    await runLong(
      `cd ${esc(installDir)} && composer install --no-dev --optimize-autoloader --no-interaction --no-progress`,
      600_000
    )
  })

  // 4. React panel build (jeśli panel/dist nie ma — przy git clone)
  await logStep('Build React panelu OverCMS', async () => {
    const distPath = `${installDir}/web/app/mu-plugins/overcms-core/panel/dist/.vite/manifest.json`
    if (existsSync(distPath)) {
      log.push('  panel/dist już istnieje — pomijam')
      return
    }
    // Wymaga node + npm
    await runLong(
      `cd ${esc(installDir)}/overcms-panel && npm ci --no-audit --no-fund --loglevel=error && npm run build`,
      600_000
    )
  })

  // 5. Utworzenie bazy MySQL.
  // DROP USER + CREATE USER zapewnia że jeśli to retry instalacji, user dostaje
  // świeże, aktualne hasło (CREATE USER IF NOT EXISTS zostawiało stary hash
  // i kolejna próba nie mogła się zalogować).
  await logStep('Tworzenie bazy danych MySQL', async () => {
    const sql = [
      `CREATE DATABASE IF NOT EXISTS \\\`${dbName}\\\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      `DROP USER IF EXISTS '${dbUser}'@'localhost';`,
      `CREATE USER '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';`,
      `GRANT ALL PRIVILEGES ON \\\`${dbName}\\\`.* TO '${dbUser}'@'localhost';`,
      `FLUSH PRIVILEGES;`,
    ].join(' ')
    await runLong(`mysql -e "${sql}"`, 30_000)
  })

  // 6. Uruchomienie installer/install.sh
  // env -u DATABASE_URL: OVERPANEL ma w swoim środowisku DATABASE_URL
  // (do PostgreSQL/Prismy) i to dziedziczyłoby się do php → Bedrock próbowałby
  // sparsować ten URL w config/application.php. Wycinamy też resztę WP env vars
  // żeby Bedrock zawsze czytał świeżo z .env.
  await logStep('Konfiguracja WordPress (installer/install.sh)', async () => {
    const cmd = [
      `cd ${esc(installDir)} &&`,
      `env -u DATABASE_URL -u DB_NAME -u DB_USER -u DB_PASSWORD -u DB_HOST`,
      `-u WP_HOME -u WP_SITEURL -u WP_ENV`,
      `bash installer/install.sh`,
      `--domain=${sq(domain)}`,
      `--db-name=${sq(dbName)}`,
      `--db-user=${sq(dbUser)}`,
      `--db-pass=${sq(dbPass)}`,
      `--admin-user=${sq(adminUser)}`,
      `--admin-email=${sq(adminEmail)}`,
      `--admin-pass=${sq(adminPassword)}`,
      `--non-interactive`,
    ].join(' ')
    await runLong(cmd, 600_000)
  })

  // 6b. Tytuł witryny (opcjonalnie nadpisz domyślny "OverCMS")
  if (siteTitle && siteTitle.trim()) {
    await logStep('Ustawianie tytułu witryny', async () => {
      // OVERPANEL biegnie jako root → wp-cli wymaga --allow-root
      const wp = process.getuid && process.getuid() === 0 ? 'wp --allow-root' : 'wp'
      await runLong(
        `cd ${esc(installDir)} && ${wp} option update blogname ${sq(siteTitle)} --path=web/wp`,
        30_000
      )
    })
  }

  // 7. Permissions
  await logStep('Ustawianie uprawnień plików (www-data)', async () => {
    await run(`chown -R www-data:www-data ${esc(installDir)}/web/app/uploads ${esc(installDir)}/web/app/mu-plugins/overcms-core 2>/dev/null || true`)
    await run(`chmod 640 ${esc(installDir)}/.env 2>/dev/null || true`)
  })

  log.push(`✓ Instalacja OverCMS 2.0 zakończona pomyślnie (źródło: ${usedSource})`)
  await writeInstallStatus(domain, {
    status: 'success',
    step: 'done',
    log,
    startedAt,
    completedAt: new Date().toISOString(),
  })

  return {
    installDir,
    documentRoot,
    dbName,
    dbUser,
    panelUrl: `https://${domain}/wp/wp-admin/admin.php?page=overcms`,
  }
}

export async function uninstallOverCms2(domain: string): Promise<void> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${WWW_ROOT}/${safeDomain}`

  // Spróbuj wyciągnąć db_name z .env (żeby nie zostawić sieroty w MySQL)
  let dbName: string | null = null
  let dbUser: string | null = null
  try {
    const env = await readFile(`${installDir}/.env`, 'utf-8')
    dbName = env.match(/^DB_NAME=['"]?([^'"\n]+)/m)?.[1] ?? null
    dbUser = env.match(/^DB_USER=['"]?([^'"\n]+)/m)?.[1] ?? null
  } catch {}

  if (dbName && dbUser && /^[a-z0-9_]+$/.test(dbName) && /^[a-z0-9_]+$/.test(dbUser)) {
    try {
      await run(`mysql -e "DROP DATABASE IF EXISTS \\\`${dbName}\\\`; DROP USER IF EXISTS '${dbUser}'@'localhost';"`)
    } catch {
      // ignore — admin może wyczyścić ręcznie
    }
  }

  await run(`rm -rf ${esc(installDir)}`)
}
