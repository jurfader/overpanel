/**
 * WordPress auto-installer using WP-CLI
 */

import { run, esc } from './shell.js'

// Single-quote shell escaping — safe for any string
function sq(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`
}

export interface WpInstallOptions {
  domain: string
  documentRoot: string
  dbEngine: 'mysql' | 'postgresql'
  dbName: string
  dbUser: string
  dbPassword: string
  dbHost?: string
  dbPort?: number
  siteTitle: string
  adminUser: string
  adminPassword: string
  adminEmail: string
  locale?: string
}

export interface WpInstallResult {
  success: boolean
  version?: string
  error?: string
}

// ── WP-CLI detection ──────────────────────────────────────────────────────────

export async function isWpCliAvailable(): Promise<boolean> {
  try {
    await run('wp --info --allow-root')
    return true
  } catch {
    return false
  }
}

// ── Install ───────────────────────────────────────────────────────────────────

export async function installWordPress(opts: WpInstallOptions): Promise<WpInstallResult> {
  const {
    domain,
    documentRoot,
    dbEngine,
    dbName,
    dbUser,
    dbPassword,
    dbHost = 'localhost',
    dbPort,
    siteTitle,
    adminUser,
    adminPassword,
    adminEmail,
    locale = 'en_US',
  } = opts

  const safePath = esc(documentRoot)
  const safeDomain = esc(domain)
  const safeLocale = esc(locale)

  // Determine DB port
  const effectivePort = dbPort ?? (dbEngine === 'postgresql' ? 5432 : 3306)
  const dbHostWithPort = `${dbHost}:${effectivePort}`

  try {
    // 1. Download WordPress core
    await run(
      `wp core download --path=${safePath} --locale=${safeLocale} --allow-root --force`
    )

    // 2. Create wp-config.php (use sq() for values that may contain special chars)
    const configCmd = [
      `wp config create`,
      `--path=${safePath}`,
      `--dbname=${sq(dbName)}`,
      `--dbuser=${sq(dbUser)}`,
      `--dbpass=${sq(dbPassword)}`,
      `--dbhost=${sq(dbHostWithPort)}`,
      `--allow-root`,
      `--skip-check`,
    ].join(' ')

    await run(configCmd)

    // 2b. Add reverse proxy HTTPS detection to wp-config.php
    const httpsSnippet = `
/* HTTPS behind reverse proxy (Cloudflare Tunnel / nginx) */
if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
    $_SERVER['HTTPS'] = 'on';
}
`
    await run(`wp config set FORCE_SSL_ADMIN true --raw --allow-root --path=${safePath}`).catch(() => {})
    // Insert snippet after <?php in wp-config.php
    const wpConfigPath = `${documentRoot}/wp-config.php`
    try {
      const { readFile: rf, writeFile: wf } = await import('fs/promises')
      let wpConfig = await rf(wpConfigPath, 'utf-8')
      if (!wpConfig.includes('HTTP_X_FORWARDED_PROTO')) {
        wpConfig = wpConfig.replace('<?php', '<?php' + httpsSnippet)
        await wf(wpConfigPath, wpConfig, 'utf-8')
      }
    } catch {}

    // 3. Run WordPress install
    const siteUrl = `https://${safeDomain}`
    const installCmd = [
      `wp core install`,
      `--path=${safePath}`,
      `--url=${sq(siteUrl)}`,
      `--title=${sq(siteTitle)}`,
      `--admin_user=${sq(adminUser)}`,
      `--admin_password=${sq(adminPassword)}`,
      `--admin_email=${sq(adminEmail)}`,
      `--allow-root`,
      `--skip-email`,
    ].join(' ')

    await run(installCmd)

    // 4. Force HTTPS URLs (Cloudflare tunnel provides SSL)
    await run(`wp option update siteurl ${sq(siteUrl)} --allow-root --path=${safePath}`).catch(() => {})
    await run(`wp option update home ${sq(siteUrl)} --allow-root --path=${safePath}`).catch(() => {})

    // 5. Remove default content
    await run(`wp post delete 1 2 --force --allow-root --path=${safePath}`).catch(() => {})
    await run(`wp comment delete 1 --force --allow-root --path=${safePath}`).catch(() => {})

    // 6. Set correct file permissions
    await run(`chown -R www-data:www-data ${safePath}`)

    // 7. Get version
    const version = await getWpVersion(documentRoot)

    return { success: true, version }
  } catch (err: any) {
    return { success: false, error: err.message ?? String(err) }
  }
}

// ── Version & update ──────────────────────────────────────────────────────────

export async function getWpVersion(documentRoot: string): Promise<string> {
  try {
    const { stdout } = await run(`wp core version --path=${esc(documentRoot)} --allow-root`)
    return stdout.trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function updateWordPress(documentRoot: string): Promise<{ success: boolean; version?: string; error?: string }> {
  const safePath = esc(documentRoot)
  try {
    await run(`wp core update --path=${safePath} --allow-root`)
    await run(`wp plugin update --all --path=${safePath} --allow-root`)
    const version = await getWpVersion(documentRoot)
    return { success: true, version }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ── Uninstall ─────────────────────────────────────────────────────────────────

export async function uninstallWordPress(documentRoot: string): Promise<void> {
  const safePath = esc(documentRoot)
  // Remove all WP files but keep the directory
  await run(`find ${safePath} -maxdepth 1 -name "wp-*" -exec rm -rf {} + 2>/dev/null || true`)
  await run(`find ${safePath} -maxdepth 1 -name "xmlrpc.php" -delete 2>/dev/null || true`)
  await run(`find ${safePath} -maxdepth 1 -name "index.php" -delete 2>/dev/null || true`)
}
