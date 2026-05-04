/**
 * OVERCRM (Laravel 12 + Vue 3 + Inertia) installer
 *
 * Każda instancja jest instalowana w /var/www/{domain}/, Nginx vhost serwuje
 * /var/www/{domain}/public/ jako document root (standardowy Laravel layout).
 *
 * Tryb pobierania źródła: git clone z GitHub. Repo jurfader/overcrm jest
 * prywatne — wymaga skonfigurowanego git credential helper na serwerze
 * (deploy key SSH dla git@github.com:jurfader/overcrm.git, lub PAT w
 * env GITHUB_TOKEN).
 *
 * Wzorzec analogiczny do services/overcms2.ts. Różnice:
 *   - Laravel zamiast WordPress/Bedrock
 *   - document_root: public/ (nie web/)
 *   - npm run build (Vite) zamiast composer panel build
 *   - php artisan migrate zamiast wp install
 *   - Cron queue worker (Laravel queue) zamiast WP cron
 */

import { run, esc, sq } from './shell.js'
import { randomBytes, createHash } from 'crypto'
import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

const OVERCRM_REPO = 'https://github.com/jurfader/overcrm.git'
const OVERCRM_REPO_SSH = 'git@github.com:jurfader/overcrm.git'
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
  return `${INSTALL_STATUS_DIR}/overcrm-install-${domain.replace(/[^a-z0-9.-]/g, '')}.json`
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

function bcryptHash(password: string): string {
  // Wywołujemy php-cli do bcrypt — Laravel używa cost 12.
  // Zwraca hash do bezpośredniego INSERT-a w MySQL.
  // execSync zaimportowany na górze pliku (ESM nie ma `require`).
  const escaped = password.replace(/'/g, "\\'")
  return execSync(`php -r "echo password_hash('${escaped}', PASSWORD_BCRYPT, ['cost' => 12]);"`).toString()
}

async function runLong(command: string, timeout = 600_000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(command, { timeout, maxBuffer: 32 * 1024 * 1024 })
  } catch (err: any) {
    const details = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n')
    throw new Error(`Command failed: ${command}\n${details}`)
  }
}

export interface OverCrmInstallOptions {
  domain: string
  adminEmail: string
  adminPassword: string
  brandName?: string         // np. 'Chicken King CRM' — nadpisuje BRAND_NAME w .env
  brandPrimary?: string      // hex, np. '#E91E8C'
  brandSecondary?: string    // hex, np. '#9B26D9'
  licenseKey?: string        // jeśli podany — POST /activate na license server + zapis w .env
}

export interface OverCrmInstallResult {
  installDir: string
  documentRoot: string
  dbName: string
  dbUser: string
  appUrl: string
}

/**
 * Główny installer OVERCRM. Kroki:
 *  1. Cleanup poprzedniej instalacji
 *  2. git clone z GitHub
 *  3. composer install (production deps)
 *  4. npm install + npm run build (Vite)
 *  5. Utworzenie bazy MySQL
 *  6. Konfiguracja .env (DB, APP_URL, BRAND, LICENSE)
 *  7. php artisan key:generate + storage:link + migrate
 *  8. Pierwszy admin (INSERT do users)
 *  9. (opcjonalnie) Aktywacja licencji
 * 10. php artisan optimize (config/route/view cache)
 * 11. Permissions (www-data)
 * 12. Cron queue worker
 */
export async function installOverCrm(options: OverCrmInstallOptions): Promise<OverCrmInstallResult> {
  const { domain, adminEmail, adminPassword, brandName, brandPrimary, brandSecondary, licenseKey } = options
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installationId = randomBytes(16).toString('hex')
  const licenseServerUrl = process.env['OVERCMS_LICENSE_SERVER_URL'] ?? 'http://51.38.137.199:3002'

  if (!safeDomain || safeDomain !== domain) {
    throw new Error(`Niepoprawna domena: ${domain}`)
  }
  if (adminPassword.length < 8) {
    throw new Error('Hasło administratora musi mieć min. 8 znaków')
  }

  // db_name max 64 znaki, prefix oc_ żeby się nie mieszało z overcms_*
  const dbBase = ('oc_' + safeDomain.replace(/[^a-z0-9]/g, '_')).slice(0, 60)
  const dbName = dbBase
  const dbUser = dbBase.slice(0, 32)
  const dbPass = generatePassword(28)

  const installDir = `${WWW_ROOT}/${safeDomain}`
  const documentRoot = `${installDir}/public`

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
        status: 'failed', step, log, startedAt,
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

  // 2. Git clone (HTTPS najpierw, fallback do SSH jeśli token nieskonfigurowany)
  let usedSource: 'https' | 'ssh' = 'https'
  await logStep('Klonowanie repo OVERCRM', async () => {
    // Spróbuj HTTPS — używa GH_TOKEN z env jeśli skonfigurowany, lub git credential.helper
    const httpsRepo = process.env['GITHUB_TOKEN']
      ? OVERCRM_REPO.replace('https://', `https://${process.env['GITHUB_TOKEN']}@`)
      : OVERCRM_REPO
    try {
      await runLong(
        `git clone --depth 1 ${sq(httpsRepo)} ${esc(installDir)}`,
        300_000
      )
    } catch (httpsErr: any) {
      // Fallback do SSH (wymaga deploy key skonfigurowanego dla git@github.com)
      log.push(`  HTTPS clone nieudane, fallback do SSH (${httpsErr.message?.slice(0, 80) ?? 'unknown'})`)
      usedSource = 'ssh'
      await run(`rm -rf ${esc(installDir)} && mkdir -p ${esc(installDir)}`)
      await runLong(
        `GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no' git clone --depth 1 ${OVERCRM_REPO_SSH} ${esc(installDir)}`,
        300_000
      )
    }
  })

  // 2b. Zapisz wersję (commit hash) dla checkOverCrmUpdate
  await logStep('Zapisywanie wersji', async () => {
    let version = 'unknown'
    try {
      const { stdout } = await execAsync(`git -C ${esc(installDir)} rev-parse --short HEAD`)
      version = stdout.trim()
    } catch {
      // ignore
    }
    await writeFile(`${installDir}/.overcrm-version`, version, 'utf-8')
  })

  // 3. Composer install (production deps)
  await logStep('Instalacja zależności Composer (--no-dev)', async () => {
    await runLong(
      `cd ${esc(installDir)} && COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction --no-progress`,
      600_000
    )
  })

  // 4. NPM install + Vite build
  // NODE_ENV=development MUSI być, bo OVERPANEL biegnie pod NODE_ENV=production —
  // npm ci wtedy pomija devDependencies (w tym laravel-vite-plugin), a vite build
  // ich potrzebuje. Po zbudowaniu Vite sam wstrzykuje NODE_ENV=production do bundle.
  await logStep('Build frontend (npm ci + npm run build)', async () => {
    await runLong(
      `cd ${esc(installDir)} && NODE_ENV=development npm ci --no-audit --no-fund --loglevel=error`,
      600_000
    )
    await runLong(
      `cd ${esc(installDir)} && NODE_ENV=production npm run build`,
      600_000
    )
  })

  // 5. MySQL DB + user
  await logStep('Tworzenie bazy MySQL', async () => {
    const sql = [
      `CREATE DATABASE IF NOT EXISTS \\\`${dbName}\\\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      `DROP USER IF EXISTS '${dbUser}'@'localhost';`,
      `CREATE USER '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';`,
      `GRANT ALL PRIVILEGES ON \\\`${dbName}\\\`.* TO '${dbUser}'@'localhost';`,
      `FLUSH PRIVILEGES;`,
    ].join(' ')
    await runLong(`mysql -e "${sql}"`, 30_000)
  })

  // 6. Konfiguracja .env
  await logStep('Konfiguracja .env', async () => {
    // Skopiuj .env.example jako bazę
    await run(`cp ${esc(installDir)}/.env.example ${esc(installDir)}/.env`)

    // Funkcja pomocnicza — zamień klucz w .env
    const setEnv = async (key: string, value: string): Promise<void> => {
      // Escape regex special chars w wartości i key
      const escapedValue = value.replace(/[\\&|/]/g, '\\$&')
      // sed -i: jeśli klucz istnieje, zamień; jeśli nie, dopisz na końcu
      await run(
        `grep -q '^${key}=' ${esc(installDir)}/.env ` +
        `&& sed -i 's|^${key}=.*|${key}=${escapedValue}|' ${esc(installDir)}/.env ` +
        `|| echo '${key}=${escapedValue}' >> ${esc(installDir)}/.env`
      )
    }

    await setEnv('APP_URL',     `https://${domain}`)
    await setEnv('APP_ENV',     'production')
    await setEnv('APP_DEBUG',   'false')
    await setEnv('APP_DOMAIN',  domain)
    await setEnv('DB_HOST',     '127.0.0.1')
    await setEnv('DB_PORT',     '3306')
    await setEnv('DB_DATABASE', dbName)
    await setEnv('DB_USERNAME', dbUser)
    await setEnv('DB_PASSWORD', dbPass)

    if (brandName) {
      await setEnv('BRAND_NAME',         brandName)
      await setEnv('BRAND_SHORT_NAME',   brandName)
      await setEnv('BRAND_COMPANY_NAME', brandName)
    }
    if (brandPrimary)   await setEnv('BRAND_PRIMARY',   brandPrimary)
    if (brandSecondary) await setEnv('BRAND_SECONDARY', brandSecondary)

    if (licenseKey?.trim()) {
      await setEnv('OVERCRM_LICENSE_KEY',  licenseKey.trim())
      await setEnv('LICENSE_SERVER_URL',   licenseServerUrl)
      await setEnv('OVERCRM_INSTALL_ID',   installationId)
    }
  })

  // 7. Laravel boot: key + storage + migrate
  await logStep('Laravel: key:generate + storage:link + migrate', async () => {
    await runLong(
      `cd ${esc(installDir)} && php artisan key:generate --force --no-interaction`,
      30_000
    )
    await runLong(
      `cd ${esc(installDir)} && php artisan storage:link`,
      30_000
    )
    await runLong(
      `cd ${esc(installDir)} && php artisan migrate --force --no-interaction`,
      300_000
    )
  })

  // 8. Pierwszy admin (INSERT do users)
  // Bcrypt hash zawiera znaki '$' (np. $2y$12$...). NIE wolno wstawiać go do
  // mysql -e "..." (double-quoted bash) — bash interpoluje $2y jako zmienną
  // i hash zostaje skorumpowany. Heredoc <<'EOF' (single-quoted) wyłącza
  // wszystkie shell substitutions — bezpieczne dla każdego znaku.
  await logStep('Tworzenie pierwszego administratora', async () => {
    const passwordHash = bcryptHash(adminPassword).replace(/'/g, "''")  // SQL-escape '
    const sqlEmail = adminEmail.replace(/'/g, "''")
    const sql =
      `INSERT INTO users (name, email, password, role, status, email_verified_at, created_at, updated_at)\n` +
      `VALUES ('Administrator', '${sqlEmail}', '${passwordHash}', 'admin', 'active', NOW(), NOW(), NOW())\n` +
      `ON DUPLICATE KEY UPDATE password=VALUES(password), role='admin', status='active', updated_at=NOW();`
    // Heredoc <<'CRMSQL' — single-quoted delimiter wyłącza interpolation $vars
    await runLong(`mysql ${esc(dbName)} <<'CRMSQL'\n${sql}\nCRMSQL`, 30_000)
  })

  // 9. License activation
  if (licenseKey?.trim()) {
    await logStep('Aktywacja licencji OVERCRM', async () => {
      const res = await fetch(`${licenseServerUrl}/activate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ licenseKey: licenseKey.trim(), domain, installationId }),
      })
      if (!res.ok) {
        const err = await res.text().catch(() => '')
        throw new Error(`License activation failed (${res.status}): ${err.slice(0, 200)}`)
      }
      const data = await res.json() as { plan?: string }
      log.push(`  Plan: ${data.plan ?? 'unknown'}`)
    }).catch((err: any) => {
      // Niefatalne — kontynuuj instalację, klient sam aktywuje przez UI
      log.push(`  ⚠ Aktywacja licencji nieudana (non-fatal): ${err?.message?.slice(0, 200) ?? 'unknown'}`)
    })
  } else {
    log.push(`  ℹ Brak klucza licencyjnego — pomijam aktywację. Klient wpisze klucz w panelu.`)
  }

  // 10. Optimize
  await logStep('Optymalizacja Laravel (config/route/view cache)', async () => {
    await runLong(`cd ${esc(installDir)} && php artisan config:cache`, 30_000)
    await runLong(`cd ${esc(installDir)} && php artisan route:cache`, 30_000)
    await runLong(`cd ${esc(installDir)} && php artisan view:cache`, 30_000)
  })

  // 11. Permissions
  await logStep('Ustawianie uprawnień (www-data)', async () => {
    await run(`chown -R www-data:www-data ${esc(installDir)} 2>/dev/null || true`)
    await run(`chmod -R 755 ${esc(installDir)}/storage ${esc(installDir)}/bootstrap/cache 2>/dev/null || true`)
    await run(`chmod 640 ${esc(installDir)}/.env 2>/dev/null || true`)
    await run(`chown www-data:www-data ${esc(installDir)}/.env 2>/dev/null || true`)
  })

  // 12. Cron queue worker
  await logStep('Konfiguracja cron dla queue worker', async () => {
    const cronName = `overcrm-${safeDomain.replace(/[^a-zA-Z0-9]/g, '_')}`
    const cronFile = `/etc/cron.d/${cronName}`
    const cronLine = `* * * * * www-data cd ${installDir} && php artisan queue:work --stop-when-empty --max-time=55 >/dev/null 2>&1\n`
    await writeFile(cronFile, cronLine, 'utf-8')
    await run(`chmod 644 ${esc(cronFile)}`)
  })

  log.push(`✓ Instalacja OVERCRM zakończona pomyślnie (źródło: ${usedSource})`)
  await writeInstallStatus(domain, {
    status: 'success', step: 'done', log, startedAt,
    completedAt: new Date().toISOString(),
  })

  return {
    installDir,
    documentRoot,
    dbName,
    dbUser,
    appUrl: `https://${domain}`,
  }
}

// ── Update status helpers ────────────────────────────────────────────────────

function updateStatusFile(domain: string): string {
  return `${INSTALL_STATUS_DIR}/overcrm-update-${domain.replace(/[^a-z0-9.-]/g, '')}.json`
}

export async function readUpdateStatus(domain: string): Promise<InstallStatus | null> {
  const f = updateStatusFile(domain)
  if (!existsSync(f)) return null
  try {
    return JSON.parse(await readFile(f, 'utf-8'))
  } catch {
    return null
  }
}

async function writeUpdateStatus(domain: string, data: InstallStatus): Promise<void> {
  await writeFile(updateStatusFile(domain), JSON.stringify(data, null, 2), 'utf-8')
}

// ── Check update ─────────────────────────────────────────────────────────────

export interface OverCrmUpdateInfo {
  hasUpdate: boolean
  currentVersion?: string
  latestVersion?: string
  error?: string
}

export async function checkOverCrmUpdate(domain: string): Promise<OverCrmUpdateInfo> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${WWW_ROOT}/${safeDomain}`
  const versionFile = `${installDir}/.overcrm-version`

  try {
    const { stdout: remoteOut } = await execAsync(
      `git ls-remote ${OVERCRM_REPO} refs/heads/main`,
      { timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
    )
    const latestFull = remoteOut.split('\t')[0]?.trim()
    const latestVersion = latestFull?.slice(0, 7) ?? 'unknown'
    if (latestVersion === 'unknown') {
      return { hasUpdate: false, currentVersion: 'unknown', latestVersion: 'unknown' }
    }

    let currentVersion: string | null = null
    if (existsSync(versionFile)) {
      currentVersion = (await readFile(versionFile, 'utf-8')).trim()
    } else if (existsSync(`${installDir}/.git`)) {
      // -c safe.directory='*' — install dir należy do www-data, my (root) potrzebujemy ominąć dubious-ownership check
      const { stdout } = await execAsync(`git -c safe.directory='*' -C ${esc(installDir)} rev-parse --short HEAD`)
      currentVersion = stdout.trim()
    }

    if (!currentVersion) {
      await writeFile(versionFile, 'legacy', 'utf-8').catch(() => {})
      return { hasUpdate: true, currentVersion: 'legacy', latestVersion }
    }

    if (currentVersion === 'legacy' || !latestFull?.startsWith(currentVersion)) {
      return { hasUpdate: true, currentVersion, latestVersion }
    }
    return { hasUpdate: false, currentVersion, latestVersion }
  } catch (err: any) {
    return { hasUpdate: false, error: err.message }
  }
}

// ── Update ───────────────────────────────────────────────────────────────────

/**
 * Aktualizuje OVERCRM in-place: git pull + composer install + npm build + migrate.
 * Zachowuje .env, storage/, public/storage/.
 */
export async function updateOverCrm(domain: string): Promise<void> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${WWW_ROOT}/${safeDomain}`
  const startedAt = new Date().toISOString()
  const log: string[] = []

  if (!existsSync(installDir)) {
    throw new Error(`Instalacja OVERCRM nie istnieje: ${installDir}`)
  }

  const logStep = async (step: string, fn: () => Promise<void>): Promise<void> => {
    log.push(`> ${step}`)
    await writeUpdateStatus(domain, { status: 'running', step, log, startedAt })
    try {
      await fn()
      log.push(`✓ ${step}`)
      await writeUpdateStatus(domain, { status: 'running', step, log, startedAt })
    } catch (err: any) {
      const msg = err.message || String(err)
      const lines = msg.split('\n').filter((l: string) => l.trim())
      for (const line of lines.slice(-15)) log.push(`  ${line}`)
      log.push(`✗ ${step}`)
      await writeUpdateStatus(domain, {
        status: 'failed', step, log, startedAt,
        completedAt: new Date().toISOString(),
      })
      throw err
    }
  }

  let latestCommit = 'unknown'

  // 1. Maintenance mode
  await logStep('Maintenance mode ON', async () => {
    await run(`cd ${esc(installDir)} && php artisan down --render="errors::503" 2>/dev/null || true`)
  })

  // 2. Git pull (zachowuje lokalne zmiany w .env bo .env jest gitignored)
  // -c safe.directory='*' — install dir należy do www-data, my (root) wymagamy
  // ominięcia dubious-ownership check git'a. To inline (nie zmienia globalnego config).
  await logStep('Git pull', async () => {
    await runLong(
      `cd ${esc(installDir)} && git -c safe.directory='*' fetch --depth 1 origin main && git -c safe.directory='*' reset --hard origin/main`,
      120_000
    )
    const { stdout } = await execAsync(`git -c safe.directory='*' -C ${esc(installDir)} rev-parse --short HEAD`)
    latestCommit = stdout.trim()
    log.push(`  Nowa wersja: ${latestCommit}`)
  })

  // 3. Composer install
  await logStep('Composer install', async () => {
    await runLong(
      `cd ${esc(installDir)} && COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction --no-progress`,
      600_000
    )
  })

  // 4. NPM build (j.w. — NODE_ENV=development dla npm ci)
  await logStep('Build frontend', async () => {
    await runLong(
      `cd ${esc(installDir)} && NODE_ENV=development npm ci --no-audit --no-fund --loglevel=error && NODE_ENV=production npm run build`,
      600_000
    )
  })

  // 5. Migrate
  await logStep('Migracja bazy', async () => {
    await runLong(
      `cd ${esc(installDir)} && php artisan migrate --force --no-interaction`,
      300_000
    )
  })

  // 6. Cache rebuild
  await logStep('Rebuild cache', async () => {
    await runLong(`cd ${esc(installDir)} && php artisan config:cache && php artisan route:cache && php artisan view:cache`, 60_000)
  })

  // 7. Permissions
  await logStep('Ustawianie uprawnień (www-data)', async () => {
    await run(`chown -R www-data:www-data ${esc(installDir)} 2>/dev/null || true`)
    await run(`chmod -R 755 ${esc(installDir)}/storage ${esc(installDir)}/bootstrap/cache 2>/dev/null || true`)
  })

  // 8. Save version
  await logStep('Zapisywanie wersji', async () => {
    await writeFile(`${installDir}/.overcrm-version`, latestCommit, 'utf-8')
  })

  // 9. Maintenance OFF
  await logStep('Maintenance mode OFF', async () => {
    await run(`cd ${esc(installDir)} && php artisan up`)
  })

  log.push(`✓ Aktualizacja OVERCRM zakończona pomyślnie (${latestCommit})`)
  await writeUpdateStatus(domain, {
    status: 'success', step: 'done', log, startedAt,
    completedAt: new Date().toISOString(),
  })
}

// ── Uninstall ────────────────────────────────────────────────────────────────

export async function uninstallOverCrm(domain: string): Promise<void> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${WWW_ROOT}/${safeDomain}`

  // Wyciągnij db_name z .env
  let dbName: string | null = null
  let dbUser: string | null = null
  try {
    const env = await readFile(`${installDir}/.env`, 'utf-8')
    dbName = env.match(/^DB_DATABASE=['"]?([^'"\n]+)/m)?.[1] ?? null
    dbUser = env.match(/^DB_USERNAME=['"]?([^'"\n]+)/m)?.[1] ?? null
  } catch {}

  if (dbName && dbUser && /^[a-z0-9_]+$/.test(dbName) && /^[a-z0-9_]+$/.test(dbUser)) {
    try {
      await run(`mysql -e "DROP DATABASE IF EXISTS \\\`${dbName}\\\`; DROP USER IF EXISTS '${dbUser}'@'localhost';"`)
    } catch {
      // ignore — admin może wyczyścić ręcznie
    }
  }

  // Usuń cron
  const cronName = `overcrm-${safeDomain.replace(/[^a-zA-Z0-9]/g, '_')}`
  await run(`rm -f /etc/cron.d/${cronName} 2>/dev/null || true`)

  // Usuń katalog
  await run(`rm -rf ${esc(installDir)}`)
}

// Suppress unused import warning (createHash kept for future signature verify)
void createHash
