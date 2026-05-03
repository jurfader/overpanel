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
  licenseKey?: string   // jeśli podany, OVERPANEL aktywuje licencję i pobiera Divi
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
  const { domain, adminUser, adminEmail, adminPassword, siteTitle, licenseKey } = options
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installationId = randomBytes(16).toString('hex')
  const licenseServerUrl = process.env['OVERCMS_LICENSE_SERVER_URL'] ?? 'http://51.38.137.199:3002'

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

  // 2b. Zapisz wersję żeby checkOverCms2Update wiedział od czego porównywać
  await logStep('Zapisywanie wersji', async () => {
    let version = 'unknown'
    try {
      // Z pobranego źródła — jeśli to git clone, możemy odczytać HEAD
      if (existsSync(`${installDir}/.git`)) {
        const { stdout } = await execAsync(`git -C ${esc(installDir)} rev-parse --short HEAD`)
        version = stdout.trim()
      } else {
        // ZIP release: pobierz aktualny commit z remote
        const { stdout } = await execAsync(
          `git ls-remote ${OVERCMS2_REPO} refs/heads/main`,
          { timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
        )
        version = stdout.split('\t')[0]?.trim().slice(0, 7) ?? 'unknown'
      }
    } catch {
      // ignore
    }
    await writeFile(`${installDir}/.overcms2-version`, version, 'utf-8')
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
      `cd ${esc(installDir)}/overcms-panel && NODE_ENV=development npm ci --no-audit --no-fund --loglevel=error && npm run build`,
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

  // 6a2. Pretty permalinks — Divi Theme Builder ładuje layouty (header/footer/body)
  // pod URL-em /et_header_layout/.../ etc. Z plain permalinks (?p=123) takie URL-e
  // dostają 404 i Visual Builder w iframe nie ładuje się — pokazuje nieskończony
  // loader. Ustawiamy postname structure + flush rewrite rules.
  await logStep('Konfiguracja pretty permalinks (/%postname%/)', async () => {
    const wp = process.getuid && process.getuid() === 0 ? 'wp --allow-root' : 'wp'
    const wpEnv =
      `env -u DATABASE_URL -u DB_NAME -u DB_USER -u DB_PASSWORD -u DB_HOST ` +
      `-u WP_HOME -u WP_SITEURL -u WP_ENV `
    await runLong(
      `cd ${esc(installDir)} && ${wpEnv}${wp} option update permalink_structure '/%postname%/' --path=web/wp`,
      30_000
    )
    await runLong(
      `cd ${esc(installDir)} && ${wpEnv}${wp} rewrite flush --path=web/wp`,
      30_000
    )
  })

  // 6b. Tytuł witryny (opcjonalnie nadpisz domyślny "OverCMS")
  // env -u DATABASE_URL: bez tego Bedrock próbuje sparsować DATABASE_URL OVERPANEL-a
  // (PostgreSQL DSN) i wp-cli wywala "Error establishing a database connection".
  if (siteTitle && siteTitle.trim()) {
    await logStep('Ustawianie tytułu witryny', async () => {
      const wp = process.getuid && process.getuid() === 0 ? 'wp --allow-root' : 'wp'
      await runLong(
        `cd ${esc(installDir)} && ` +
        `env -u DATABASE_URL -u DB_NAME -u DB_USER -u DB_PASSWORD -u DB_HOST ` +
        `-u WP_HOME -u WP_SITEURL -u WP_ENV ` +
        `${wp} option update blogname ${sq(siteTitle)} --path=web/wp`,
        30_000
      )
    })
  }

  // 6c. Aktywacja licencji OverCMS + pobranie i instalacja motywu Divi
  //
  // Flow:
  //   1. POST {licenseServer}/activate          — rejestruje domenę pod kluczem
  //   2. POST {licenseServer}/themes/divi/download
  //      → streamuje Divi.zip + zwraca w nagłówkach kredencjały Elegant Themes
  //        (X-OverCMS-License-Username, X-OverCMS-License-Key)
  //   3. unzip do web/app/themes/, aktywacja przez wp-cli
  //   4. zapis kredencjałów ET do wp_option et_automatic_updates_options
  //
  // Bez licenseKey ten krok jest pomijany — klient może później wpisać klucz
  // w panelu Ustawienia i pobrać Divi ręcznie.

  if (licenseKey?.trim()) {
    await logStep('Aktywacja licencji OverCMS', async () => {
      const res = await fetch(`${licenseServerUrl}/activate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ licenseKey: licenseKey.trim(), domain, installationId }),
      })
      if (!res.ok) {
        const err = await res.text().catch(() => '')
        throw new Error(`License activation failed (${res.status}): ${err.slice(0, 200)}`)
      }
      const data = await res.json() as { success?: boolean; plan?: string }
      log.push(`  Plan: ${data.plan ?? 'unknown'}`)
    }).catch((err: any) => {
      // Niefatalny — kontynuuj instalację bez Divi
      log.push(`  ⚠ Aktywacja licencji nieudana (non-fatal): ${err?.message?.slice(0, 200) ?? 'unknown'}`)
      log.push(`  Instalacja kontynuuje bez Divi. Klient może wpisać klucz w Ustawieniach panelu.`)
    })

    // Pobranie i instalacja Divi (tylko jeśli aktywacja nie wywaliła się fatalnie)
    const lastStatus = await readInstallStatus(domain)
    const lastLogLine = lastStatus?.log?.[lastStatus.log.length - 1] ?? ''
    if (!lastLogLine.includes('⚠ Aktywacja licencji nieudana')) {
      await logStep('Pobieranie i instalacja motywu Divi', async () => {
        const res = await fetch(`${licenseServerUrl}/themes/divi/download`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ licenseKey: licenseKey.trim(), domain, installationId }),
        })
        if (!res.ok) {
          const err = await res.text().catch(() => '')
          throw new Error(`Divi download failed (${res.status}): ${err.slice(0, 200)}`)
        }

        // Wyciągnij kredencjały ET z nagłówków
        const etUsername = res.headers.get('x-overcms-license-username')
        const etApiKey   = res.headers.get('x-overcms-license-key')

        // Zapisz binarny .zip
        const tmpZip = `/tmp/divi-${safeDomain}-${Date.now()}.zip`
        const buf = Buffer.from(await res.arrayBuffer())
        await writeFile(tmpZip, buf)

        // Rozpakuj do themes/
        await runLong(
          `unzip -q -o ${esc(tmpZip)} -d ${esc(installDir)}/web/app/themes/`,
          120_000
        )
        await run(`rm -f ${esc(tmpZip)}`)

        // Aktywuj motyw przez wp-cli
        const wp = process.getuid && process.getuid() === 0 ? 'wp --allow-root' : 'wp'
        const wpEnv =
          `env -u DATABASE_URL -u DB_NAME -u DB_USER -u DB_PASSWORD -u DB_HOST ` +
          `-u WP_HOME -u WP_SITEURL -u WP_ENV `
        await runLong(
          `cd ${esc(installDir)} && ${wpEnv}${wp} theme activate Divi --path=web/wp`,
          60_000
        )

        // Wstrzyknij ET credentials do wp_option (Divi czyta z 'et_automatic_updates_options')
        if (etUsername && etApiKey) {
          const phpSerialize = (u: string, k: string): string =>
            `a:2:{s:8:"username";s:${u.length}:"${u}";s:7:"api_key";s:${k.length}:"${k}";}`
          const serialized = phpSerialize(etUsername, etApiKey)
          await runLong(
            `cd ${esc(installDir)} && ${wpEnv}${wp} option update et_automatic_updates_options ${sq(serialized)} --format=plaintext --path=web/wp`,
            30_000
          )
          log.push(`  Kredencjały Elegant Themes zapisane (auto-update aktywny)`)
        }
      }).catch((err: any) => {
        log.push(`  ⚠ Instalacja Divi nieudana (non-fatal): ${err?.message?.slice(0, 200) ?? 'unknown'}`)
        log.push(`  Klient może spróbować ponownie przez panel: Moduły → Wgraj motyw`)
      })
    }

    // Zapisz klucz licencyjny w .env instalacji żeby OverCMS Updater
    // mógł później sprawdzać licencję sam (24h heartbeat).
    await logStep('Zapisywanie klucza licencji w .env', async () => {
      const envAppend =
        `\n# OverCMS licensing\n` +
        `OVERCMS_LICENSE_KEY='${licenseKey.trim()}'\n` +
        `OVERCMS_INSTALL_ID='${installationId}'\n` +
        `LICENSE_SERVER_URL='${licenseServerUrl}'\n`
      await run(`echo ${sq(envAppend)} >> ${esc(installDir)}/.env`)
    })
  } else {
    log.push(`  ℹ Brak klucza licencyjnego — Divi nie zostanie zainstalowane.`)
    log.push(`  Klient może wpisać klucz w panelu (Ustawienia → Licencja) żeby pobrać Divi później.`)
  }

  // 7. Permissions
  // .env musi być czytelny przez www-data (PHP-FPM), inaczej Bedrock rzuca
  // Dotenv\Exception\InvalidPathException → 500 na każdym requeście.
  // web/app: pluginy cache (cache-enabler) i uploads wymagają zapisu — chown
  // całego app/, nie tylko uploads/.
  await logStep('Ustawianie uprawnień plików (www-data)', async () => {
    await run(`chown -R www-data:www-data ${esc(installDir)}/web/app 2>/dev/null || true`)
    await run(`chown www-data:www-data ${esc(installDir)}/.env 2>/dev/null || true`)
    await run(`chmod 640 ${esc(installDir)}/.env 2>/dev/null || true`)
  })

  // 7b. Deaktywuj cache-enabler — wymaga FS_METHOD jako PHP define, nie env var.
  // Z aktywnym cache-enablerem każdy request rzuca "FTP hostname is required".
  // Klient może go włączyć ręcznie po skonfigurowaniu FS_METHOD w wp-config.
  await logStep('Dezaktywacja cache-enabler (wymaga FS_METHOD)', async () => {
    const wp = process.getuid && process.getuid() === 0 ? 'wp --allow-root' : 'wp'
    await run(
      `cd ${esc(installDir)} && ` +
      `env -u DATABASE_URL -u DB_NAME -u DB_USER -u DB_PASSWORD -u DB_HOST ` +
      `-u WP_HOME -u WP_SITEURL -u WP_ENV ` +
      `${wp} plugin deactivate cache-enabler --path=web/wp 2>/dev/null || true`
    )
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

// ── Update status helpers ────────────────────────────────────────────────────

function updateStatusFile(domain: string): string {
  return `${INSTALL_STATUS_DIR}/overcms2-update-${domain.replace(/[^a-z0-9.-]/g, '')}.json`
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

export interface OverCms2UpdateInfo {
  hasUpdate: boolean
  currentVersion?: string
  latestVersion?: string
  commits?: number
  changes?: string[]
  error?: string
}

/**
 * Sprawdź czy jest dostępna nowa wersja OverCMS 2.0.
 * Porównuje lokalny commit (zapisany w .overcms2-version) z najnowszym z GitHub.
 */
export async function checkOverCms2Update(domain: string): Promise<OverCms2UpdateInfo> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${WWW_ROOT}/${safeDomain}`
  const versionFile = `${installDir}/.overcms2-version`

  try {
    // Najnowszy commit na main z remote
    const { stdout: remoteOut } = await execAsync(
      `git ls-remote ${OVERCMS2_REPO} refs/heads/main`,
      { timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
    )
    const latestFull = remoteOut.split('\t')[0]?.trim()
    const latestVersion = latestFull?.slice(0, 7) ?? 'unknown'

    if (latestVersion === 'unknown') {
      return { hasUpdate: false, currentVersion: 'unknown', latestVersion: 'unknown' }
    }

    // Lokalny commit
    let currentVersion: string | null = null
    if (existsSync(versionFile)) {
      currentVersion = (await readFile(versionFile, 'utf-8')).trim()
    } else if (existsSync(`${installDir}/.git`)) {
      const { stdout } = await execAsync(`git -C ${esc(installDir)} rev-parse --short HEAD`)
      currentVersion = stdout.trim()
    }

    // Stara instalacja bez .overcms2-version i bez .git → załóż że jest update dostępny
    // (klient może bezpiecznie zaktualizować, updateOverCms2 zachowa .env i uploads)
    if (!currentVersion) {
      // Zapisz placeholder żeby pokazać się w UI że potrzebny update
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
 * Aktualizuje OverCMS 2.0 in-place: pobiera świeże źródła z GitHub i nakłada
 * je na istniejącą instalację, zachowując .env, web/app/uploads i web/app/themes.
 */
export async function updateOverCms2(domain: string): Promise<void> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${WWW_ROOT}/${safeDomain}`
  const tmpDir = `/tmp/overcms2-update-${safeDomain}-${Date.now()}`
  const startedAt = new Date().toISOString()
  const log: string[] = []

  if (!existsSync(installDir)) {
    throw new Error(`Instalacja OverCMS 2.0 nie istnieje: ${installDir}`)
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
      for (const line of lines.slice(-15)) {
        log.push(`  ${line}`)
      }
      log.push(`✗ ${step}`)
      await writeUpdateStatus(domain, {
        status: 'failed', step, log, startedAt,
        completedAt: new Date().toISOString(),
      })
      throw err
    }
  }

  // 1. Backup .env, uploads i themes (zachowujemy motywy użytkownika, np. Divi)
  let latestCommit = 'unknown'
  await logStep('Backup .env, uploads i themes', async () => {
    await run(`mkdir -p ${esc(tmpDir)}/backup`)
    await run(`cp ${esc(installDir)}/.env ${esc(tmpDir)}/backup/.env`)
    if (existsSync(`${installDir}/web/app/uploads`)) {
      await run(`cp -a ${esc(installDir)}/web/app/uploads ${esc(tmpDir)}/backup/uploads`)
    }
    if (existsSync(`${installDir}/web/app/themes`)) {
      await run(`cp -a ${esc(installDir)}/web/app/themes ${esc(tmpDir)}/backup/themes`)
    }
  })

  // 2. Pobierz świeże źródła z GitHub
  await logStep('Pobieranie nowej wersji z GitHub', async () => {
    await runLong(
      `git clone --depth 1 ${OVERCMS2_REPO} ${esc(tmpDir)}/src`,
      120_000
    )
    const { stdout } = await execAsync(`git -C ${esc(tmpDir)}/src rev-parse --short HEAD`)
    latestCommit = stdout.trim()
    log.push(`  Nowa wersja: ${latestCommit}`)
  })

  // 3. Composer install (vendor/) — używamy świeżego composer.lock z repo
  await logStep('Instalacja zależności Composer', async () => {
    await runLong(
      `cd ${esc(tmpDir)}/src && composer install --no-dev --optimize-autoloader --no-interaction 2>&1`,
      300_000
    )
  })

  // 3b. Build React panelu — musi być przed rsync, żeby panel/dist trafił do installDir
  await logStep('Build panelu React (overcms-panel)', async () => {
    await runLong(
      `cd ${esc(tmpDir)}/src/overcms-panel && NODE_ENV=development npm ci --no-audit --no-fund --loglevel=error && npm run build`,
      600_000
    )
  })

  // 4. Nadpisz pliki — zachowaj .env, uploads, db.sqlite, logs
  await logStep('Aktualizacja plików aplikacji', async () => {
    // Skopiuj wszystko poza tym co użytkownik zmodyfikował
    // rsync z exclude — nie nadpisuje .env, uploads, logs
    await run(
      `rsync -a --delete ` +
      `--exclude='.env' ` +
      `--exclude='web/app/uploads/' ` +
      `--exclude='web/app/themes/' ` +
      `--exclude='web/app/plugins/' ` +
      `--exclude='logs/' ` +
      `--exclude='.overcms2-version' ` +
      `${esc(tmpDir)}/src/ ${esc(installDir)}/`
    )
  })

  // 5. Przywróć .env, uploads i themes
  await logStep('Przywracanie .env, uploads i themes', async () => {
    await run(`cp ${esc(tmpDir)}/backup/.env ${esc(installDir)}/.env`)
    if (existsSync(`${tmpDir}/backup/uploads`)) {
      await run(`mkdir -p ${esc(installDir)}/web/app && cp -a ${esc(tmpDir)}/backup/uploads ${esc(installDir)}/web/app/`)
    }
    if (existsSync(`${tmpDir}/backup/themes`)) {
      await run(`mkdir -p ${esc(installDir)}/web/app && cp -a ${esc(tmpDir)}/backup/themes ${esc(installDir)}/web/app/`)
    }
  })

  // 6. WordPress core update (wp/) — instalator pobiera nowy core przez composer
  // ale jeśli baza wymaga migracji, wp-cli ją wykona
  await logStep('Migracja bazy WordPress (wp core update-db)', async () => {
    const wp = process.getuid && process.getuid() === 0 ? 'wp --allow-root' : 'wp'
    await runLong(
      `cd ${esc(installDir)} && ` +
      `env -u DATABASE_URL -u DB_NAME -u DB_USER -u DB_PASSWORD -u DB_HOST ` +
      `-u WP_HOME -u WP_SITEURL -u WP_ENV ` +
      `${wp} core update-db --path=web/wp 2>&1 || true`,
      120_000
    )
  })

  // 7. Wyczyść cache (jeśli plugin cache aktywny)
  await logStep('Czyszczenie cache', async () => {
    const wp = process.getuid && process.getuid() === 0 ? 'wp --allow-root' : 'wp'
    await run(
      `cd ${esc(installDir)} && ` +
      `env -u DATABASE_URL -u DB_NAME -u DB_USER -u DB_PASSWORD -u DB_HOST ` +
      `-u WP_HOME -u WP_SITEURL -u WP_ENV ` +
      `${wp} cache flush --path=web/wp 2>/dev/null || true`
    )
  })

  // 8. Permissions (po rsync owner mogł się zmienić)
  await logStep('Ustawianie uprawnień (www-data)', async () => {
    await run(`chown -R www-data:www-data ${esc(installDir)}/web/app 2>/dev/null || true`)
    await run(`chown www-data:www-data ${esc(installDir)}/.env 2>/dev/null || true`)
    await run(`chmod 640 ${esc(installDir)}/.env 2>/dev/null || true`)
  })

  // 9. Zapisz nową wersję
  await logStep('Zapisywanie wersji', async () => {
    await writeFile(`${installDir}/.overcms2-version`, latestCommit, 'utf-8')
  })

  // 10. Cleanup tmp
  await logStep('Czyszczenie plików tymczasowych', async () => {
    await run(`rm -rf ${esc(tmpDir)}`)
  })

  log.push(`✓ Aktualizacja OverCMS 2.0 zakończona pomyślnie (${latestCommit})`)
  await writeUpdateStatus(domain, {
    status: 'success', step: 'done', log, startedAt,
    completedAt: new Date().toISOString(),
  })
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
