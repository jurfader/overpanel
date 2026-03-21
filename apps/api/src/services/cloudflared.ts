/**
 * cloudflared tunnel management
 *
 * Obsługuje dodawanie/usuwanie domen z konfiguracji tunelu Cloudflare.
 * Tunel routuje ruch: Cloudflare Edge → cloudflared → nginx (localhost)
 */

import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { run } from './shell.js'

// Możliwe lokalizacje configu cloudflared
const CONFIG_PATHS = [
  '/etc/cloudflared/config.yml',
  '/root/.cloudflared/config.yml',
  '/home/cloudflared/.cloudflared/config.yml',
]

export interface TunnelInfo {
  running: boolean
  tunnelId: string | null
  tunnelName: string | null
  configPath: string | null
}

export interface IngressRule {
  hostname?: string
  service: string
  originRequest?: Record<string, unknown>
}

export interface TunnelConfig {
  tunnel: string
  'credentials-file': string
  ingress: IngressRule[]
  [key: string]: unknown
}

// ── Wykrywanie tunelu ─────────────────────────────────────────────────────────

export async function getTunnelInfo(): Promise<TunnelInfo> {
  // Sprawdź czy cloudflared jest uruchomiony
  let running = false
  try {
    await run('systemctl is-active cloudflared')
    running = true
  } catch {
    // nie działa jako systemd, sprawdź proces
    try {
      await run('pgrep cloudflared')
      running = true
    } catch {
      running = false
    }
  }

  if (!running) return { running: false, tunnelId: null, tunnelName: null, configPath: null }

  // Znajdź plik konfiguracyjny
  const configPath = CONFIG_PATHS.find(existsSync) ?? null
  if (!configPath) return { running, tunnelId: null, tunnelName: null, configPath: null }

  try {
    const config = await readTunnelConfig(configPath)
    return {
      running,
      tunnelId: config.tunnel ?? null,
      tunnelName: config.tunnel ?? null,
      configPath,
    }
  } catch {
    return { running, tunnelId: null, tunnelName: null, configPath }
  }
}

export async function isTunnelActive(): Promise<boolean> {
  const info = await getTunnelInfo()
  return info.running && info.configPath !== null
}

// ── Config management ─────────────────────────────────────────────────────────

async function readTunnelConfig(configPath: string): Promise<TunnelConfig> {
  const raw = await readFile(configPath, 'utf-8')
  // Minimalistyczny YAML parser dla prostej struktury tunelu
  return parseSimpleYaml(raw) as TunnelConfig
}

async function writeTunnelConfig(configPath: string, config: TunnelConfig): Promise<void> {
  const yaml = serializeConfig(config)
  await writeFile(configPath, yaml, 'utf-8')
}

/**
 * Dodaj domenę do konfiguracji tunelu.
 * Wstawia regułę PRZED catch-all (ostatnia reguła bez hostname).
 */
export async function addDomainToTunnel(domain: string): Promise<void> {
  const info = await getTunnelInfo()
  if (!info.configPath) throw new Error('Brak konfiguracji tunelu cloudflared')

  const content = await readFile(info.configPath, 'utf-8')

  // Już istnieje?
  if (content.includes(`hostname: ${domain}`)) return

  // Backup
  await writeFile(info.configPath + '.bak', content, 'utf-8')

  // Wstaw nową regułę przed catch-all (sed — niezawodne)
  const entry = `  - hostname: ${domain}\\n    service: http://localhost:80`

  try {
    if (content.includes('http_status:404') || content.includes('http_status: 404')) {
      // Wstaw przed catch-all
      await run(`sed -i 's|.*service: http_status.*|${entry}\\n  - service: http_status:404|' ${info.configPath}`)
    } else if (content.includes('ingress:')) {
      // Dopisz na końcu sekcji ingress
      await run(`echo '${entry.replace(/\\n/g, '\n')}' >> ${info.configPath}`)
    } else {
      throw new Error('Brak sekcji ingress w config.yml')
    }

    await reloadTunnel()
  } catch (err) {
    // Rollback
    console.error('[cloudflared] addDomainToTunnel failed, rolling back:', err)
    await writeFile(info.configPath, content, 'utf-8')
    await run('systemctl restart cloudflared').catch(() => {})
    throw err
  }
}

/**
 * Usuń domenę z konfiguracji tunelu.
 */
export async function removeDomainFromTunnel(domain: string): Promise<void> {
  const info = await getTunnelInfo()
  if (!info.configPath) return

  const content = await readFile(info.configPath, 'utf-8')
  if (!content.includes(`hostname: ${domain}`)) return

  await writeFile(info.configPath + '.bak', content, 'utf-8')

  try {
    // Usuń hostname line + następną linię (service)
    await run(`sed -i '/hostname: ${domain}/,+1d' ${info.configPath}`)
    await reloadTunnel()
  } catch (err) {
    console.error('[cloudflared] removeDomainFromTunnel failed, rolling back:', err)
    await writeFile(info.configPath, content, 'utf-8')
    await run('systemctl restart cloudflared').catch(() => {})
  }
}

/**
 * Pobierz listę domen skonfigurowanych w tunelu.
 */
export async function listTunnelDomains(): Promise<string[]> {
  const info = await getTunnelInfo()
  if (!info.configPath) return []

  const content = await readFile(info.configPath, 'utf-8')
  const domains: string[] = []
  for (const line of content.split('\n')) {
    const match = line.match(/hostname:\s*(.+)/)
    if (match && match[1] && !match[1].startsWith('www.')) {
      domains.push(match[1].trim())
    }
  }
  return domains
}

// ── Reload ────────────────────────────────────────────────────────────────────

export async function reloadTunnel(): Promise<void> {
  // cloudflared nie obsługuje reload/HUP — musi być restart
  // Czekamy chwilę żeby upewnić się że config jest zapisany
  await new Promise((r) => setTimeout(r, 500))
  try {
    await run('systemctl restart cloudflared')
    // Poczekaj aż się uruchomi
    await new Promise((r) => setTimeout(r, 2000))
    await run('systemctl is-active cloudflared')
  } catch (err) {
    console.error('[cloudflared] Restart failed:', err)
    throw new Error('Cloudflared restart failed — sprawdź config ręcznie')
  }
}

// ── Minimal YAML parser/serializer ────────────────────────────────────────────
// Wystarczy dla prostych plików konfiguracyjnych cloudflared

function parseSimpleYaml(raw: string): Record<string, unknown> {
  const lines = raw.split('\n')
  const result: Record<string, unknown> = {}
  let inIngress = false
  const ingress: IngressRule[] = []
  let currentRule: Partial<IngressRule> = {}

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue

    if (line.startsWith('ingress:')) {
      inIngress = true
      continue
    }

    if (inIngress) {
      if (line.startsWith('  - ') || line.startsWith('- ')) {
        if (Object.keys(currentRule).length > 0) ingress.push(currentRule as IngressRule)
        currentRule = {}
        const kvLine = line.replace(/^\s*-\s*/, '')
        const [k, ...vParts] = kvLine.split(':')
        if (k && vParts.length > 0) {
          (currentRule as Record<string, string>)[k.trim()] = vParts.join(':').trim()
        }
      } else if (line.startsWith('    ') || line.startsWith('\t')) {
        const [k, ...vParts] = line.trim().split(':')
        if (k && vParts.length > 0) {
          (currentRule as Record<string, string>)[k.trim()] = vParts.join(':').trim()
        }
      } else {
        // Opuściliśmy sekcję ingress
        if (Object.keys(currentRule).length > 0) {
          ingress.push(currentRule as IngressRule)
          currentRule = {}
        }
        inIngress = false
        const [k, ...vParts] = line.split(':')
        if (k && vParts.length > 0) result[k.trim()] = vParts.join(':').trim()
      }
    } else {
      const [k, ...vParts] = line.split(':')
      if (k && vParts.length > 0) result[k.trim()] = vParts.join(':').trim()
    }
  }

  if (Object.keys(currentRule).length > 0) ingress.push(currentRule as IngressRule)
  result['ingress'] = ingress

  return result
}

function serializeConfig(config: TunnelConfig): string {
  const lines: string[] = []

  // Najpierw pola skalarne
  for (const [key, value] of Object.entries(config)) {
    if (key === 'ingress') continue
    lines.push(`${key}: ${value}`)
  }

  lines.push('')
  lines.push('ingress:')

  for (const rule of config.ingress) {
    if (rule.hostname) {
      lines.push(`  - hostname: ${rule.hostname}`)
      lines.push(`    service: ${rule.service}`)
    } else {
      lines.push(`  - service: ${rule.service}`)
    }
    if (rule.originRequest) {
      lines.push('    originRequest:')
      for (const [k, v] of Object.entries(rule.originRequest)) {
        lines.push(`      ${k}: ${v}`)
      }
    }
  }

  return lines.join('\n') + '\n'
}
