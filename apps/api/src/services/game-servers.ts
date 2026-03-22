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
}

export const GAME_SERVER_TEMPLATES: GameServerTemplate[] = [
  // FPS
  { id: 'cs2server', name: 'Counter-Strike 2', shortName: 'cs2server', category: 'FPS' },
  { id: 'csgoserver', name: 'Counter-Strike: GO', shortName: 'csgoserver', category: 'FPS' },
  { id: 'cssserver', name: 'Counter-Strike: Source', shortName: 'cssserver', category: 'FPS' },
  { id: 'tf2server', name: 'Team Fortress 2', shortName: 'tf2server', category: 'FPS' },
  { id: 'gmodserver', name: "Garry's Mod", shortName: 'gmodserver', category: 'FPS' },
  { id: 'insserver', name: 'Insurgency', shortName: 'insserver', category: 'FPS' },
  { id: 'inssserver', name: 'Insurgency: Sandstorm', shortName: 'inssserver', category: 'FPS' },
  { id: 'l4dserver', name: 'Left 4 Dead', shortName: 'l4dserver', category: 'FPS' },
  { id: 'l4d2server', name: 'Left 4 Dead 2', shortName: 'l4d2server', category: 'FPS' },
  { id: 'cod4server', name: 'Call of Duty 4', shortName: 'cod4server', category: 'FPS' },
  { id: 'kf2server', name: 'Killing Floor 2', shortName: 'kf2server', category: 'FPS' },
  { id: 'squadserver', name: 'Squad', shortName: 'squadserver', category: 'FPS' },
  { id: 'pvrserver', name: 'Pavlov VR', shortName: 'pvrserver', category: 'FPS' },
  { id: 'arma3server', name: 'Arma 3', shortName: 'arma3server', category: 'FPS' },

  // Survival
  { id: 'rustserver', name: 'Rust', shortName: 'rustserver', category: 'Survival' },
  { id: 'arkserver', name: 'ARK: Survival Evolved', shortName: 'arkserver', category: 'Survival' },
  { id: 'dayzserver', name: 'DayZ', shortName: 'dayzserver', category: 'Survival' },
  { id: 'vhserver', name: 'Valheim', shortName: 'vhserver', category: 'Survival' },
  { id: 'pzserver', name: 'Project Zomboid', shortName: 'pzserver', category: 'Survival' },
  { id: 'sdtdserver', name: '7 Days to Die', shortName: 'sdtdserver', category: 'Survival' },
  { id: 'dstserver', name: "Don't Starve Together", shortName: 'dstserver', category: 'Survival' },
  { id: 'untserver', name: 'Unturned', shortName: 'untserver', category: 'Survival' },
  { id: 'ecoserver', name: 'Eco', shortName: 'ecoserver', category: 'Survival' },
  { id: 'ckserver', name: 'Core Keeper', shortName: 'ckserver', category: 'Survival' },
  { id: 'hzserver', name: 'Haze (SCUM)', shortName: 'hzserver', category: 'Survival' },
  { id: 'pwserver', name: 'Palworld', shortName: 'pwserver', category: 'Survival' },

  // Sandbox
  { id: 'mcserver', name: 'Minecraft: Java', shortName: 'mcserver', category: 'Sandbox' },
  { id: 'mcbserver', name: 'Minecraft: Bedrock', shortName: 'mcbserver', category: 'Sandbox' },
  { id: 'terrariaserver', name: 'Terraria', shortName: 'terrariaserver', category: 'Sandbox' },
  { id: 'sbserver', name: 'Starbound', shortName: 'sbserver', category: 'Sandbox' },
  { id: 'fctrserver', name: 'Factorio', shortName: 'fctrserver', category: 'Sandbox' },
  { id: 'sfserver', name: 'Satisfactory', shortName: 'sfserver', category: 'Sandbox' },
  { id: 'vintsserver', name: 'Vintage Story', shortName: 'vintsserver', category: 'Sandbox' },

  // RPG / Inne
  { id: 'mhserver', name: 'Mordhau', shortName: 'mhserver', category: 'RPG' },
  { id: 'cmwserver', name: 'Chivalry: Medieval Warfare', shortName: 'cmwserver', category: 'RPG' },
  { id: 'tiserver', name: 'The Isle', shortName: 'tiserver', category: 'RPG' },
  { id: 'vrserver', name: 'V Rising', shortName: 'vrserver', category: 'RPG' },

  // VoIP
  { id: 'ts3server', name: 'TeamSpeak 3', shortName: 'ts3server', category: 'VoIP' },
  { id: 'mumbleserver', name: 'Mumble', shortName: 'mumbleserver', category: 'VoIP' },
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

export async function installGameServer(shortName: string): Promise<void> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
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

  log.push('✓ Instalacja serwera gry zakończona pomyślnie!')
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

export async function getInstalledServers(): Promise<string[]> {
  try {
    const entries = await readdir(GAME_SERVERS_BASE)
    const installed: string[] = []
    for (const entry of entries) {
      // Check if it has the linuxgsm.sh script (valid install)
      if (existsSync(`${GAME_SERVERS_BASE}/${entry}/linuxgsm.sh`)) {
        installed.push(entry)
      }
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
