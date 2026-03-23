/**
 * OpenClaw AI Assistant — Docker Compose installer
 *
 * Each OpenClaw instance is installed into /opt/openclaw-sites/<domain>/
 * with a unique set of ports so multiple installs can coexist.
 */

import { run } from './shell.js'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

const OPENCLAW_BASE_DIR = '/opt/openclaw-sites'
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
  return `${INSTALL_STATUS_DIR}/openclaw-install-${domain.replace(/[^a-z0-9.-]/g, '')}.json`
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

/** Run a shell command with a custom timeout (ms). */
async function runLong(command: string, timeout = 300_000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(command, { timeout })
  } catch (err: any) {
    const details = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n')
    throw new Error(`Command failed: ${command}\n${details}`)
  }
}

// Get next available port range (each OpenClaw install needs 2 ports)
async function getNextPortBase(): Promise<number> {
  // Start at 20000 (separate range from OverCMS which starts at 10000)
  const { stdout } = await run(`ls ${OPENCLAW_BASE_DIR} 2>/dev/null | wc -l`).catch(() => ({ stdout: '0', stderr: '' }))
  const count = parseInt(stdout.trim()) || 0
  return 20000 + (count * 10)
}

// ── Install ─────────────────────────────────────────────────────────────────

export interface OpenClawInstallOptions {
  domain: string
  openaiApiKey?: string
  anthropicApiKey?: string
  telegramToken?: string
  discordToken?: string
  slackToken?: string
}

export async function installOpenClaw(options: OpenClawInstallOptions): Promise<{
  gatewayPort: number
}> {
  const { domain, openaiApiKey, anthropicApiKey, telegramToken, discordToken, slackToken } = options
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${OPENCLAW_BASE_DIR}/${safeDomain}`
  const portBase = await getNextPortBase()

  const gatewayPort = portBase
  const dashboardPort = portBase + 1
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
      const msg = err.message || String(err)
      const lines = msg.split('\n').filter((l: string) => l.trim())
      for (const line of lines.slice(-15)) {
        log.push(`  ${line}`)
      }
      log.push(`✗ ${step}`)
      await writeInstallStatus(domain, { status: 'failed', step, log, startedAt, completedAt: new Date().toISOString() })
      throw err
    }
  }

  // 1. Clean up previous install
  await logStep('Czyszczenie poprzedniej instalacji', async () => {
    if (existsSync(installDir)) {
      await runLong(`cd ${installDir} && docker compose down -v 2>/dev/null || true`, 60_000)
      await run(`rm -rf ${installDir}`)
    }
    await run(`mkdir -p ${installDir}/config`)
  })

  // 2. Generate OpenClaw config (openclaw.json)
  await logStep('Generowanie konfiguracji OpenClaw', async () => {
    const config: Record<string, unknown> = {}

    if (openaiApiKey) config.openaiApiKey = openaiApiKey
    if (anthropicApiKey) config.anthropicApiKey = anthropicApiKey

    // Messaging channels
    if (telegramToken) config.telegram = { botToken: telegramToken }
    if (discordToken) config.discord = { botToken: discordToken }
    if (slackToken) config.slack = { botToken: slackToken }

    // Gateway settings
    config.gateway = { port: 18789 }

    await writeFile(`${installDir}/config/openclaw.json`, JSON.stringify(config, null, 2), 'utf-8')
  })

  // 3. Generate docker-compose.yml
  const composeContent = `
services:
  openclaw-gateway:
    container_name: openclaw-gw-${containerPrefix}
    image: node:22-alpine
    working_dir: /app
    command: ["sh", "-c", "npm i -g openclaw && openclaw gateway --config /root/.openclaw/openclaw.json"]
    ports:
      - "${gatewayPort}:18789"
      - "${dashboardPort}:18790"
    volumes:
      - ./config:/root/.openclaw
    environment:
      - OPENCLAW_GATEWAY_TOKEN=${containerPrefix}
    restart: unless-stopped
`.trim()

  await logStep('Generowanie docker-compose.yml', async () => {
    await writeFile(`${installDir}/docker-compose.yml`, composeContent, 'utf-8')
  })

  // 4. Pull and start containers
  await logStep('Uruchamianie kontenerów OpenClaw', async () => {
    await runLong(`cd ${installDir} && docker compose up -d`, 300_000)
  })

  // 5. Wait for gateway to be ready
  await logStep('Oczekiwanie na gotowość gateway', async () => {
    for (let i = 0; i < 30; i++) {
      try {
        const { stdout } = await run(`curl -sf http://127.0.0.1:${gatewayPort}/health 2>/dev/null || curl -sf http://127.0.0.1:${gatewayPort}/ 2>/dev/null`)
        if (stdout) break
      } catch {}
      await new Promise(r => setTimeout(r, 3000))
    }
  })

  // 6. Save port mapping
  await logStep('Zapisywanie konfiguracji portów', async () => {
    await writeFile(
      `${installDir}/ports.json`,
      JSON.stringify({ gatewayPort, dashboardPort }),
      'utf-8'
    )
  })

  log.push('✓ Instalacja OpenClaw zakończona pomyślnie!')
  await writeInstallStatus(domain, { status: 'success', step: 'done', log, startedAt, completedAt: new Date().toISOString() })

  return { gatewayPort }
}

// ── Uninstall ───────────────────────────────────────────────────────────────

export async function uninstallOpenClaw(domain: string): Promise<void> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${OPENCLAW_BASE_DIR}/${safeDomain}`

  await runLong(`cd ${installDir} && docker compose down -v 2>/dev/null || true`)
  await run(`rm -rf ${installDir}`)
}

// ── Status ──────────────────────────────────────────────────────────────────

export async function isOpenClawRunning(domain: string): Promise<boolean> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const containerName = `openclaw-gw-${safeDomain.replace(/\./g, '-')}`
  try {
    const { stdout } = await run(`docker inspect -f '{{.State.Running}}' ${containerName} 2>/dev/null`)
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

// ── Config management ───────────────────────────────────────────────────────

export async function getOpenClawConfig(domain: string): Promise<Record<string, unknown> | null> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const configPath = `${OPENCLAW_BASE_DIR}/${safeDomain}/config/openclaw.json`
  if (!existsSync(configPath)) return null
  try {
    return JSON.parse(await readFile(configPath, 'utf-8'))
  } catch {
    return null
  }
}

export async function updateOpenClawConfig(domain: string, config: Record<string, unknown>): Promise<void> {
  const safeDomain = domain.replace(/[^a-z0-9.-]/g, '')
  const installDir = `${OPENCLAW_BASE_DIR}/${safeDomain}`
  const configPath = `${installDir}/config/openclaw.json`

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')

  // Restart gateway to pick up new config
  const containerName = `openclaw-gw-${safeDomain.replace(/\./g, '-')}`
  await run(`docker restart ${containerName}`).catch(() => {})
}
