/**
 * Game Servers management via LinuxGSM
 *
 * Each game server is installed to /opt/game-servers/{shortName}/
 * under a dedicated `gsm` system user.
 */

import { run } from './shell.js'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, readdir, rm } from 'fs/promises'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

const GAME_SERVERS_BASE = '/opt/game-servers'
const GSM_USER = 'gsm'
const INSTALL_STATUS_DIR = '/tmp'

// ── Game server templates ────────────────────────────────────────────────────

export type GameCategory = 'FPS' | 'Survival' | 'Sandbox' | 'Racing' | 'RPG' | 'VoIP' | 'Inne'

export interface GameServerTemplate {
  id: string
  name: string
  shortName: string
  category: GameCategory
  defaultPort: number
  protocol: 'udp' | 'tcp' | 'both'
}

export const GAME_SERVER_TEMPLATES: GameServerTemplate[] = [
  // FPS
  { id: 'cs2server', name: 'Counter-Strike 2', shortName: 'cs2server', category: 'FPS', defaultPort: 27015, protocol: 'both' },
  { id: 'csgoserver', name: 'Counter-Strike: GO', shortName: 'csgoserver', category: 'FPS', defaultPort: 27015, protocol: 'both' },
  { id: 'cssserver', name: 'Counter-Strike: Source', shortName: 'cssserver', category: 'FPS', defaultPort: 27015, protocol: 'both' },
  { id: 'tf2server', name: 'Team Fortress 2', shortName: 'tf2server', category: 'FPS', defaultPort: 27015, protocol: 'both' },
  { id: 'gmodserver', name: "Garry's Mod", shortName: 'gmodserver', category: 'FPS', defaultPort: 27015, protocol: 'both' },
  { id: 'insserver', name: 'Insurgency', shortName: 'insserver', category: 'FPS', defaultPort: 27015, protocol: 'both' },
  { id: 'inssserver', name: 'Insurgency: Sandstorm', shortName: 'inssserver', category: 'FPS', defaultPort: 27102, protocol: 'both' },
  { id: 'l4dserver', name: 'Left 4 Dead', shortName: 'l4dserver', category: 'FPS', defaultPort: 27015, protocol: 'both' },
  { id: 'l4d2server', name: 'Left 4 Dead 2', shortName: 'l4d2server', category: 'FPS', defaultPort: 27015, protocol: 'both' },
  { id: 'cod4server', name: 'Call of Duty 4', shortName: 'cod4server', category: 'FPS', defaultPort: 28960, protocol: 'udp' },
  { id: 'kf2server', name: 'Killing Floor 2', shortName: 'kf2server', category: 'FPS', defaultPort: 7777, protocol: 'udp' },
  { id: 'squadserver', name: 'Squad', shortName: 'squadserver', category: 'FPS', defaultPort: 7787, protocol: 'udp' },
  { id: 'pvrserver', name: 'Pavlov VR', shortName: 'pvrserver', category: 'FPS', defaultPort: 7777, protocol: 'udp' },
  { id: 'arma3server', name: 'Arma 3', shortName: 'arma3server', category: 'FPS', defaultPort: 2302, protocol: 'udp' },

  // Survival
  { id: 'rustserver', name: 'Rust', shortName: 'rustserver', category: 'Survival', defaultPort: 28015, protocol: 'udp' },
  { id: 'arkserver', name: 'ARK: Survival Evolved', shortName: 'arkserver', category: 'Survival', defaultPort: 7777, protocol: 'udp' },
  { id: 'dayzserver', name: 'DayZ', shortName: 'dayzserver', category: 'Survival', defaultPort: 2302, protocol: 'udp' },
  { id: 'vhserver', name: 'Valheim', shortName: 'vhserver', category: 'Survival', defaultPort: 2456, protocol: 'udp' },
  { id: 'pzserver', name: 'Project Zomboid', shortName: 'pzserver', category: 'Survival', defaultPort: 16261, protocol: 'udp' },
  { id: 'sdtdserver', name: '7 Days to Die', shortName: 'sdtdserver', category: 'Survival', defaultPort: 26900, protocol: 'both' },
  { id: 'dstserver', name: "Don't Starve Together", shortName: 'dstserver', category: 'Survival', defaultPort: 10999, protocol: 'udp' },
  { id: 'untserver', name: 'Unturned', shortName: 'untserver', category: 'Survival', defaultPort: 27015, protocol: 'udp' },
  { id: 'ecoserver', name: 'Eco', shortName: 'ecoserver', category: 'Survival', defaultPort: 3000, protocol: 'udp' },
  { id: 'ckserver', name: 'Core Keeper', shortName: 'ckserver', category: 'Survival', defaultPort: 27015, protocol: 'udp' },
  { id: 'hzserver', name: 'Humanitz', shortName: 'hzserver', category: 'Survival', defaultPort: 27015, protocol: 'udp' },
  { id: 'pwserver', name: 'Palworld', shortName: 'pwserver', category: 'Survival', defaultPort: 8211, protocol: 'udp' },

  // Sandbox
  { id: 'mcserver', name: 'Minecraft: Java', shortName: 'mcserver', category: 'Sandbox', defaultPort: 25565, protocol: 'tcp' },
  { id: 'mcbserver', name: 'Minecraft: Bedrock', shortName: 'mcbserver', category: 'Sandbox', defaultPort: 19132, protocol: 'udp' },
  { id: 'terrariaserver', name: 'Terraria', shortName: 'terrariaserver', category: 'Sandbox', defaultPort: 7777, protocol: 'tcp' },
  { id: 'sbserver', name: 'Starbound', shortName: 'sbserver', category: 'Sandbox', defaultPort: 21025, protocol: 'tcp' },
  { id: 'fctrserver', name: 'Factorio', shortName: 'fctrserver', category: 'Sandbox', defaultPort: 34197, protocol: 'udp' },
  { id: 'sfserver', name: 'Satisfactory', shortName: 'sfserver', category: 'Sandbox', defaultPort: 7777, protocol: 'udp' },
  { id: 'vintsserver', name: 'Vintage Story', shortName: 'vintsserver', category: 'Sandbox', defaultPort: 42420, protocol: 'tcp' },

  // RPG / Inne
  { id: 'mhserver', name: 'Mordhau', shortName: 'mhserver', category: 'RPG', defaultPort: 7777, protocol: 'udp' },
  { id: 'cmwserver', name: 'Chivalry: Medieval Warfare', shortName: 'cmwserver', category: 'RPG', defaultPort: 7777, protocol: 'udp' },
  { id: 'tiserver', name: 'The Isle', shortName: 'tiserver', category: 'RPG', defaultPort: 7777, protocol: 'udp' },
  { id: 'vrserver', name: 'V Rising', shortName: 'vrserver', category: 'RPG', defaultPort: 9876, protocol: 'udp' },

  // VoIP
  { id: 'ts3server', name: 'TeamSpeak 3', shortName: 'ts3server', category: 'VoIP', defaultPort: 9987, protocol: 'udp' },
  { id: 'mumbleserver', name: 'Mumble', shortName: 'mumbleserver', category: 'VoIP', defaultPort: 64738, protocol: 'both' },
]

// ── Install status helpers ───────────────────────────────────────────────────

export interface InstallStatus {
  status: 'running' | 'success' | 'failed'
  step: string
  log: string[]
  startedAt: string
  completedAt?: string
}

function statusFile(shortName: string): string {
  return `${INSTALL_STATUS_DIR}/gameserver-install-${shortName.replace(/[^a-z0-9]/g, '')}.json`
}

async function writeInstallStatus(shortName: string, data: InstallStatus): Promise<void> {
  await writeFile(statusFile(shortName), JSON.stringify(data, null, 2), 'utf-8')
}

export async function readInstallStatus(shortName: string): Promise<InstallStatus | null> {
  const f = statusFile(shortName)
  if (!existsSync(f)) return null
  try {
    return JSON.parse(await readFile(f, 'utf-8'))
  } catch {
    return null
  }
}

// ── Long-running shell command ───────────────────────────────────────────────

async function runLong(command: string, timeout = 600_000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(command, { timeout })
  } catch (err: any) {
    const details = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n')
    throw new Error(`Command failed: ${command}\n${details}`)
  }
}

// ── Ensure gsm user exists ───────────────────────────────────────────────────

async function ensureGsmUser(): Promise<void> {
  try {
    await run(`id ${GSM_USER}`)
  } catch {
    await run(`useradd -m -s /bin/bash ${GSM_USER}`)
  }
}

// ── Service functions ────────────────────────────────────────────────────────

export interface GameInstallOptions {
  shortName: string
  serverName?: string
  domain?: string       // subdomain for DNS (e.g. mc.overmedia.pl)
  port?: number
  maxPlayers?: number
  password?: string
  cfToken?: string      // Cloudflare API token for DNS
}

export async function installGameServer(options: GameInstallOptions): Promise<void> {
  const { shortName, serverName, domain, port, maxPlayers, password, cfToken } = options
  const template = GAME_SERVER_TEMPLATES.find(t => t.shortName === shortName)
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
  const gamePort = port ?? template?.defaultPort ?? 27015
  const log: string[] = []
  const startedAt = new Date().toISOString()

  async function logStep(step: string, fn: () => Promise<void>): Promise<void> {
    log.push(`> ${step}`)
    await writeInstallStatus(shortName, { status: 'running', step, log, startedAt })
    try {
      await fn()
      log.push(`✓ ${step}`)
      await writeInstallStatus(shortName, { status: 'running', step, log, startedAt })
    } catch (err: any) {
      const msg = err.message || String(err)
      const lines = msg.split('\n').filter((l: string) => l.trim())
      for (const line of lines.slice(0, 10)) {
        log.push(`  ${line}`)
      }
      log.push(`✗ ${step}`)
      await writeInstallStatus(shortName, { status: 'failed', step, log, startedAt, completedAt: new Date().toISOString() })
      throw err
    }
  }

  // 1. Ensure gsm user
  await logStep('Tworzenie użytkownika systemowego gsm', async () => {
    await ensureGsmUser()
  })

  // 2. Create install directory
  await logStep('Tworzenie katalogu instalacji', async () => {
    await run(`mkdir -p ${installDir}`)
    await run(`chown ${GSM_USER}:${GSM_USER} ${installDir}`)
  })

  // 3. Download LinuxGSM
  await logStep('Pobieranie LinuxGSM', async () => {
    await runLong(`su - ${GSM_USER} -c "cd ${installDir} && curl -Lo linuxgsm.sh https://linuxgsm.sh && chmod +x linuxgsm.sh"`)
  })

  // 4. Install game server via LinuxGSM
  await logStep(`Instalacja serwera: ${safe}`, async () => {
    await runLong(`su - ${GSM_USER} -c "cd ${installDir} && bash linuxgsm.sh ${safe}"`, 120_000)
  })

  // 5. Run server install (downloads game files — can be very slow)
  await logStep('Pobieranie plików gry (to może potrwać kilka minut...)', async () => {
    await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} auto-install"`, 1800_000) // 30 min timeout
  })

  // 6. Open port in UFW firewall
  await logStep(`Otwieranie portu ${gamePort} w firewall`, async () => {
    const proto = template?.protocol ?? 'both'
    if (proto === 'tcp') {
      await run(`ufw allow ${gamePort}/tcp 2>/dev/null || true`)
    } else if (proto === 'udp') {
      await run(`ufw allow ${gamePort}/udp 2>/dev/null || true`)
    } else {
      await run(`ufw allow ${gamePort} 2>/dev/null || true`)
    }
  })

  // 7. Auto DNS record (Cloudflare, szara chmurka — DNS only, bez proxy)
  if (domain && cfToken) {
    await logStep(`Tworzenie rekordu DNS: ${domain}`, async () => {
      try {
        const { findZoneForDomain, createDnsRecord, getPublicIp } = await import('./cloudflare.js')
        const zone = await findZoneForDomain(cfToken, domain)
        if (zone) {
          const ip = await getPublicIp()
          await createDnsRecord(cfToken, zone.id, {
            type: 'A',
            name: domain,
            content: ip,
            ttl: 1,
            proxied: false, // szara chmurka — gracze łączą się bezpośrednio
          })
        }
      } catch (dnsErr: any) {
        log.push(`  DNS warning: ${dnsErr.message}`)
      }
    })
  }

  // 8. Save config
  await logStep('Zapisywanie konfiguracji', async () => {
    const config = JSON.stringify({
      shortName, serverName: serverName ?? template?.name ?? shortName,
      domain: domain ?? null, port: gamePort, maxPlayers: maxPlayers ?? null,
      password: password ?? null, installedAt: new Date().toISOString(),
    }, null, 2)
    await writeFile(`${installDir}/overpanel-config.json`, config, 'utf-8')
  })

  log.push('✓ Instalacja serwera gry zakończona pomyślnie!')
  if (domain) log.push(`  Adres: ${domain}:${gamePort}`)
  else log.push(`  Adres: <IP_SERWERA>:${gamePort}`)
  await writeInstallStatus(shortName, { status: 'success', step: 'done', log, startedAt, completedAt: new Date().toISOString() })
}

export async function startGameServer(shortName: string): Promise<void> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
  await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} start"`, 120_000)
}

export async function stopGameServer(shortName: string): Promise<void> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
  await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} stop"`, 120_000)
}

export async function restartGameServer(shortName: string): Promise<void> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
  await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} restart"`, 120_000)
}

export async function getGameServerStatus(shortName: string): Promise<{ running: boolean; pid?: number }> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
  try {
    const { stdout } = await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} details" 2>&1 || true`, 30_000)
    // LinuxGSM details output includes "Status: STARTED" or "Status: STOPPED"
    const running = /Status:\s+STARTED/i.test(stdout) || /is already running/i.test(stdout)
    const pidMatch = stdout.match(/PID:\s+(\d+)/i)
    return { running, pid: pidMatch ? parseInt(pidMatch[1], 10) : undefined }
  } catch {
    return { running: false }
  }
}

export interface InstalledServerInfo {
  shortName: string
  serverName: string
  domain: string | null
  port: number
  maxPlayers: number | null
  password: string | null
}

export async function getInstalledServers(): Promise<InstalledServerInfo[]> {
  try {
    const entries = await readdir(GAME_SERVERS_BASE)
    const installed: InstalledServerInfo[] = []
    for (const entry of entries) {
      if (!existsSync(`${GAME_SERVERS_BASE}/${entry}/linuxgsm.sh`)) continue
      const configPath = `${GAME_SERVERS_BASE}/${entry}/overpanel-config.json`
      let config: any = {}
      try {
        config = JSON.parse(await readFile(configPath, 'utf-8'))
      } catch {}
      const template = GAME_SERVER_TEMPLATES.find(t => t.shortName === entry)
      installed.push({
        shortName: entry,
        serverName: config.serverName ?? template?.name ?? entry,
        domain: config.domain ?? null,
        port: config.port ?? template?.defaultPort ?? 27015,
        maxPlayers: config.maxPlayers ?? null,
        password: config.password ?? null,
      })
    }
    return installed
  } catch {
    return []
  }
}

export async function uninstallGameServer(shortName: string): Promise<void> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`

  // Try to stop first
  try {
    await stopGameServer(shortName)
  } catch {
    // Ignore — server might not be running
  }

  // Remove directory
  await rm(installDir, { recursive: true, force: true })
}
