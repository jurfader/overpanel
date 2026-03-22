import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { adminOnly, authMiddleware, getRequestUser } from '../middleware/auth.js'
import { prisma } from '@overpanel/db'
import { readFile, writeFile, readdir, stat, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import {
  GAME_SERVER_TEMPLATES,
  installGameServer,
  installModpack,
  startGameServer,
  stopGameServer,
  restartGameServer,
  getGameServerStatus,
  getInstalledServers,
  uninstallGameServer,
  readInstallStatus,
} from '../services/game-servers.js'

const execAsync = promisify(exec)

const GAME_SERVERS_BASE = '/opt/game-servers'
const SHORT_NAME_RE = /^[a-z0-9]+$/

/** Validate shortName and ensure the server directory exists */
function validateShortName(shortName: string): string {
  if (!SHORT_NAME_RE.test(shortName)) throw new Error('Nieprawidłowa nazwa serwera')
  const dir = path.join(GAME_SERVERS_BASE, shortName)
  if (!existsSync(dir)) throw new Error('Serwer nie istnieje')
  return dir
}

/** Ensure a resolved path is within the allowed base */
function ensureWithin(filePath: string, base: string): string {
  const resolved = path.resolve(base, filePath)
  if (!resolved.startsWith(base + '/') && resolved !== base) {
    throw new Error('Path traversal detected')
  }
  return resolved
}

/** Read last N lines of a file */
async function tailFile(filePath: string, lines: number): Promise<string[]> {
  if (!existsSync(filePath)) return []
  try {
    const content = await readFile(filePath, 'utf-8')
    const all = content.split('\n')
    return all.slice(-lines).filter(l => l.length > 0)
  } catch {
    return []
  }
}

/** Find game config file path based on shortName */
function findGameConfigPath(shortName: string, serverDir: string): string | null {
  const minecraftServers = ['mcserver', 'mcbserver', 'pmcserver']
  const sourceServers = ['csserver', 'cs2server', 'csgoserver', 'cssserver', 'csczserver', 'tf2server', 'gmodserver', 'l4dserver', 'l4d2server', 'insserver', 'inssserver', 'dodserver', 'dodsserver', 'hl2dmserver', 'hldmserver']

  // Minecraft: server.properties
  if (minecraftServers.includes(shortName)) {
    const p = path.join(serverDir, 'serverfiles', 'server.properties')
    if (existsSync(p)) return p
  }

  // Source engine games: server.cfg
  if (sourceServers.includes(shortName)) {
    // Try common paths
    const candidates = [
      path.join(serverDir, 'serverfiles', 'csgo', 'cfg', 'server.cfg'),
      path.join(serverDir, 'serverfiles', 'cstrike', 'cfg', 'server.cfg'),
      path.join(serverDir, 'serverfiles', 'css', 'cfg', 'server.cfg'),
      path.join(serverDir, 'serverfiles', 'tf', 'cfg', 'server.cfg'),
      path.join(serverDir, 'serverfiles', 'garrysmod', 'cfg', 'server.cfg'),
      path.join(serverDir, 'serverfiles', 'left4dead', 'cfg', 'server.cfg'),
      path.join(serverDir, 'serverfiles', 'left4dead2', 'cfg', 'server.cfg'),
      path.join(serverDir, 'serverfiles', 'insurgency', 'cfg', 'server.cfg'),
      path.join(serverDir, 'serverfiles', 'dod', 'cfg', 'server.cfg'),
      path.join(serverDir, 'serverfiles', 'hl2mp', 'cfg', 'server.cfg'),
    ]
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
  }

  // Rust: server.cfg
  if (shortName === 'rustserver') {
    const p = path.join(serverDir, 'serverfiles', 'server', 'rustserver', 'cfg', 'server.cfg')
    if (existsSync(p)) return p
  }

  // Valheim: valheim_server.cfg / start parameters in lgsm config
  if (shortName === 'vhserver') {
    const p = path.join(serverDir, 'serverfiles', 'valheim_server_Data', 'server.cfg')
    if (existsSync(p)) return p
  }

  // Generic: look for common config files
  const genericCandidates = [
    path.join(serverDir, 'serverfiles', 'server.cfg'),
    path.join(serverDir, 'serverfiles', 'server.properties'),
    path.join(serverDir, 'serverfiles', 'config.cfg'),
    path.join(serverDir, 'serverfiles', 'server.ini'),
    path.join(serverDir, 'serverfiles', 'settings.ini'),
  ]
  for (const c of genericCandidates) {
    if (existsSync(c)) return c
  }

  return null
}

/** Find mods directory based on shortName */
function findModsDir(shortName: string, serverDir: string): string | null {
  const minecraftServers = ['mcserver', 'mcbserver', 'pmcserver']

  if (minecraftServers.includes(shortName)) {
    // Check mods/ and plugins/
    const mods = path.join(serverDir, 'serverfiles', 'mods')
    const plugins = path.join(serverDir, 'serverfiles', 'plugins')
    if (existsSync(mods)) return mods
    if (existsSync(plugins)) return plugins
    // Default to mods/
    return mods
  }

  // Source engine: addons
  const addons = path.join(serverDir, 'serverfiles', 'addons')
  if (existsSync(addons)) return addons

  // Generic: mods, plugins
  const genericCandidates = [
    path.join(serverDir, 'serverfiles', 'mods'),
    path.join(serverDir, 'serverfiles', 'plugins'),
    path.join(serverDir, 'mods'),
  ]
  for (const c of genericCandidates) {
    if (existsSync(c)) return c
  }

  return null
}

export async function gameServersRoutes(fastify: FastifyInstance) {

  // GET /api/game-servers — list all templates + installed status
  fastify.get('/', { preHandler: [adminOnly] }, async (_req, reply) => {
    try {
      const installed = await getInstalledServers()
      const templates = GAME_SERVER_TEMPLATES.map(t => ({
        ...t,
        installed: installed.some(s => s.shortName === t.shortName),
      }))
      return reply.send({ success: true, data: templates })
    } catch (err) {
      console.error('[GameServers] list error:', err)
      return reply.code(500).send({ success: false, error: 'Nie można pobrać listy serwerów' })
    }
  })

  // GET /api/game-servers/installed — list installed servers with status
  fastify.get('/installed', { preHandler: [adminOnly] }, async (_req, reply) => {
    try {
      const installed = await getInstalledServers()
      const servers = await Promise.all(
        installed.map(async (srv) => {
          const template = GAME_SERVER_TEMPLATES.find(t => t.shortName === srv.shortName)
          const status = await getGameServerStatus(srv.shortName).catch(() => ({ running: false }))
          return {
            ...srv,
            name: template?.name ?? srv.serverName,
            category: template?.category ?? 'Inne',
            steamAppId: template?.steamAppId ?? 0,
            address: srv.domain ? `${srv.domain}:${srv.port}` : `<IP>:${srv.port}`,
            ...status,
          }
        })
      )
      return reply.send({ success: true, data: servers })
    } catch (err) {
      console.error('[GameServers] installed error:', err)
      return reply.code(500).send({ success: false, error: 'Nie można pobrać zainstalowanych serwerów' })
    }
  })

  // GET /api/game-servers/install-status/:shortName — install progress
  fastify.get('/install-status/:shortName', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    try {
      const status = await readInstallStatus(shortName)
      return reply.send({ success: true, data: status })
    } catch (err) {
      return reply.code(500).send({ success: false, error: 'Nie można odczytać statusu instalacji' })
    }
  })

  // POST /api/game-servers/install — install a game server
  const installSchema = z.object({
    shortName: z.string().regex(/^[a-z0-9]+$/),
    serverName: z.string().max(100).optional(),
    domain: z.string().max(253).optional(),
    port: z.number().int().min(1024).max(65535).optional(),
    maxPlayers: z.number().int().min(1).max(1000).optional(),
    password: z.string().max(100).optional(),
    version: z.string().max(20).regex(/^[0-9.]*$/).optional(),
    serverType: z.enum(['vanilla', 'paper', 'purpur', 'fabric', 'forge']).optional(),
  })

  fastify.post('/install', { preHandler: [authMiddleware] }, async (request, reply) => {
    const body = installSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }
    const { shortName, serverName, domain, port, maxPlayers, password, version, serverType } = body.data
    const caller = getRequestUser(request)

    const template = GAME_SERVER_TEMPLATES.find(t => t.shortName === shortName)
    if (!template) {
      return reply.code(404).send({ success: false, error: 'Szablon serwera nie znaleziony' })
    }

    const installed = await getInstalledServers()
    if (installed.some(s => s.shortName === shortName)) {
      return reply.code(409).send({ success: false, error: 'Serwer już zainstalowany' })
    }

    // Get Cloudflare token for DNS
    let cfToken: string | null = null
    if (domain) {
      const tokenRecord = await prisma.cloudflareToken.findFirst({
        where: { userId: caller.id, isDefault: true },
        select: { token: true },
      })
      cfToken = tokenRecord?.token ?? process.env.CLOUDFLARE_API_TOKEN ?? null
    }

    reply.code(202).send({ success: true, data: { message: 'Instalacja rozpoczęta', shortName } })

    setImmediate(async () => {
      try {
        await installGameServer({
          shortName, serverName, domain, port, maxPlayers, password,
          cfToken: cfToken ?? undefined,
          version,
          serverType,
        })
      } catch (err) {
        console.error(`[GameServers] Install failed for ${shortName}:`, err)
      }
    })
  })

  // POST /api/game-servers/:shortName/start
  fastify.post('/:shortName/start', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    try {
      await startGameServer(shortName)
      return reply.send({ success: true, data: null })
    } catch (err) {
      console.error(`[GameServers] Start failed for ${shortName}:`, err)
      return reply.code(500).send({ success: false, error: 'Nie udało się uruchomić serwera' })
    }
  })

  // POST /api/game-servers/:shortName/stop
  fastify.post('/:shortName/stop', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    try {
      await stopGameServer(shortName)
      return reply.send({ success: true, data: null })
    } catch (err) {
      console.error(`[GameServers] Stop failed for ${shortName}:`, err)
      return reply.code(500).send({ success: false, error: 'Nie udało się zatrzymać serwera' })
    }
  })

  // POST /api/game-servers/:shortName/restart
  fastify.post('/:shortName/restart', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    try {
      await restartGameServer(shortName)
      return reply.send({ success: true, data: null })
    } catch (err) {
      console.error(`[GameServers] Restart failed for ${shortName}:`, err)
      return reply.code(500).send({ success: false, error: 'Nie udało się zrestartować serwera' })
    }
  })

  // DELETE /api/game-servers/:shortName
  fastify.delete('/:shortName', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    try {
      await uninstallGameServer(shortName)
      return reply.send({ success: true, data: null })
    } catch (err) {
      console.error(`[GameServers] Uninstall failed for ${shortName}:`, err)
      return reply.code(500).send({ success: false, error: 'Nie udało się odinstalować serwera' })
    }
  })

  // GET /api/game-servers/:shortName/status — lightweight running/pid check (for polling)
  fastify.get('/:shortName/status', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    if (!SHORT_NAME_RE.test(shortName)) {
      return reply.code(400).send({ success: false, error: 'Nieprawidłowa nazwa serwera' })
    }
    try {
      const status = await getGameServerStatus(shortName)
      return reply.send({ success: true, data: status })
    } catch {
      return reply.send({ success: true, data: { running: false } })
    }
  })

  // GET /api/game-servers/installed/:shortName — single server info + status
  fastify.get('/installed/:shortName', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    if (!SHORT_NAME_RE.test(shortName)) {
      return reply.code(400).send({ success: false, error: 'Nieprawidłowa nazwa serwera' })
    }
    try {
      const installed = await getInstalledServers()
      const srv = installed.find(s => s.shortName === shortName)
      if (!srv) {
        return reply.code(404).send({ success: false, error: 'Serwer nie znaleziony' })
      }
      const template = GAME_SERVER_TEMPLATES.find(t => t.shortName === shortName)
      const status = await getGameServerStatus(shortName).catch(() => ({ running: false }))
      return reply.send({
        success: true,
        data: {
          ...srv,
          name: template?.name ?? srv.serverName,
          category: template?.category ?? 'Inne',
          steamAppId: template?.steamAppId ?? 0,
          address: srv.domain ? `${srv.domain}:${srv.port}` : `<IP>:${srv.port}`,
          ...status,
        },
      })
    } catch (err) {
      console.error(`[GameServers] info error for ${shortName}:`, err)
      return reply.code(500).send({ success: false, error: 'Nie można pobrać informacji o serwerze' })
    }
  })

  // GET /api/game-servers/:shortName/console — last 100 lines of console log
  fastify.get('/:shortName/console', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    try {
      const serverDir = validateShortName(shortName)
      const logFile = path.join(serverDir, 'log', 'console', `${shortName}-console.log`)
      const lines = await tailFile(logFile, 100)
      return reply.send({ success: true, data: lines })
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // POST /api/game-servers/:shortName/command — send command to server
  fastify.post('/:shortName/command', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    const body = z.object({ command: z.string().min(1).max(1000) }).safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Nieprawidłowa komenda' })
    }
    try {
      validateShortName(shortName)
      const cmd = body.data.command.replace(/'/g, "'\\''")
      // Try tmux first (more reliable), fall back to LinuxGSM send
      try {
        await execAsync(`tmux send-keys -t ${shortName} '${cmd}' Enter`, { timeout: 10_000 })
      } catch {
        await execAsync(
          `su - gsm -c "cd ${GAME_SERVERS_BASE}/${shortName} && ./${shortName} send '${cmd}'"`,
          { timeout: 30_000 }
        )
      }
      return reply.send({ success: true, data: null })
    } catch (err: any) {
      console.error(`[GameServers] command error for ${shortName}:`, err)
      return reply.code(500).send({ success: false, error: 'Nie udało się wysłać komendy' })
    }
  })

  // GET /api/game-servers/:shortName/config — read config files
  fastify.get('/:shortName/config', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    try {
      const serverDir = validateShortName(shortName)

      // Game config
      let gameConfig: { file: string; content: string } | null = null
      const gameConfigPath = findGameConfigPath(shortName, serverDir)
      if (gameConfigPath && existsSync(gameConfigPath)) {
        const content = await readFile(gameConfigPath, 'utf-8')
        gameConfig = { file: gameConfigPath, content }
      }

      // LinuxGSM config
      let lgsmConfig: { file: string; content: string } | null = null
      const lgsmConfigPath = path.join(serverDir, 'lgsm', 'config-lgsm', shortName, `${shortName}.cfg`)
      if (existsSync(lgsmConfigPath)) {
        const content = await readFile(lgsmConfigPath, 'utf-8')
        lgsmConfig = { file: lgsmConfigPath, content }
      }

      return reply.send({ success: true, data: { gameConfig, lgsmConfig } })
    } catch (err: any) {
      console.error(`[GameServers] config read error for ${shortName}:`, err)
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // PUT /api/game-servers/:shortName/config — save config file
  fastify.put('/:shortName/config', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    const body = z.object({
      file: z.string().min(1),
      content: z.string(),
    }).safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Nieprawidłowe dane' })
    }
    try {
      const serverDir = validateShortName(shortName)
      // Validate the file path is within the server directory (prevent path traversal)
      const resolvedFile = path.resolve(body.data.file)
      if (!resolvedFile.startsWith(serverDir + '/') && resolvedFile !== serverDir) {
        return reply.code(403).send({ success: false, error: 'Dostęp zabroniony — plik poza katalogiem serwera' })
      }
      if (!existsSync(resolvedFile)) {
        return reply.code(404).send({ success: false, error: 'Plik nie istnieje' })
      }
      await writeFile(resolvedFile, body.data.content, 'utf-8')
      return reply.send({ success: true, data: null })
    } catch (err: any) {
      console.error(`[GameServers] config write error for ${shortName}:`, err)
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // GET /api/game-servers/:shortName/logs — last 200 lines of log files
  fastify.get('/:shortName/logs', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    try {
      const serverDir = validateShortName(shortName)
      const consolePath = path.join(serverDir, 'log', 'console', `${shortName}-console.log`)
      const scriptPath = path.join(serverDir, 'log', 'script', `${shortName}-script.log`)

      // Prefer console log, fall back to script log
      let lines = await tailFile(consolePath, 200)
      if (lines.length === 0) {
        lines = await tailFile(scriptPath, 200)
      }
      return reply.send({ success: true, data: lines })
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // GET /api/game-servers/:shortName/mods — list installed mods
  fastify.get('/:shortName/mods', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    try {
      const serverDir = validateShortName(shortName)
      const modsDir = findModsDir(shortName, serverDir)
      if (!modsDir || !existsSync(modsDir)) {
        return reply.send({ success: true, data: [] })
      }
      const entries = await readdir(modsDir)
      const mods = await Promise.all(
        entries.map(async (name) => {
          try {
            const s = await stat(path.join(modsDir, name))
            return { name, size: s.size }
          } catch {
            return { name, size: 0 }
          }
        })
      )
      return reply.send({ success: true, data: mods.filter(m => m.name !== '.' && m.name !== '..') })
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  // POST /api/game-servers/:shortName/mods/install — download and install mod
  fastify.post('/:shortName/mods/install', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    const body = z.object({
      url: z.string().url(),
      filename: z.string().min(1).max(255),
    }).safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Nieprawidłowe dane' })
    }
    try {
      const serverDir = validateShortName(shortName)

      // Validate filename (no path traversal)
      const safeName = path.basename(body.data.filename)
      if (safeName !== body.data.filename || safeName.includes('..')) {
        return reply.code(400).send({ success: false, error: 'Nieprawidłowa nazwa pliku' })
      }

      // Find or create mods dir
      let modsDir = findModsDir(shortName, serverDir)
      if (!modsDir) {
        const minecraftServers = ['mcserver', 'mcbserver', 'pmcserver']
        modsDir = minecraftServers.includes(shortName)
          ? path.join(serverDir, 'serverfiles', 'mods')
          : path.join(serverDir, 'serverfiles', 'mods')
        await execAsync(`mkdir -p '${modsDir}' && chown gsm:gsm '${modsDir}'`, { timeout: 10_000 })
      }

      const destPath = path.join(modsDir, safeName)
      // Download the file
      await execAsync(
        `curl -Lo '${destPath}' '${body.data.url.replace(/'/g, "'\\''")}'`,
        { timeout: 120_000 }
      )
      await execAsync(`chown gsm:gsm '${destPath}'`, { timeout: 5_000 })

      return reply.send({ success: true, data: null })
    } catch (err: any) {
      console.error(`[GameServers] mod install error for ${shortName}:`, err)
      return reply.code(500).send({ success: false, error: 'Nie udało się zainstalować moda' })
    }
  })

  // DELETE /api/game-servers/:shortName/mods/:filename — remove a mod
  fastify.delete('/:shortName/mods/:filename', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName, filename } = request.params as { shortName: string; filename: string }
    try {
      const serverDir = validateShortName(shortName)

      // Validate filename (no path traversal)
      const safeName = path.basename(filename)
      if (safeName !== filename || safeName.includes('..')) {
        return reply.code(400).send({ success: false, error: 'Nieprawidłowa nazwa pliku' })
      }

      const modsDir = findModsDir(shortName, serverDir)
      if (!modsDir) {
        return reply.code(404).send({ success: false, error: 'Katalog modów nie istnieje' })
      }

      const filePath = path.join(modsDir, safeName)
      ensureWithin(filePath, modsDir)

      if (!existsSync(filePath)) {
        return reply.code(404).send({ success: false, error: 'Plik nie istnieje' })
      }

      await unlink(filePath)
      return reply.send({ success: true, data: null })
    } catch (err: any) {
      console.error(`[GameServers] mod delete error for ${shortName}:`, err)
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/game-servers/:shortName/modpacks/install — install a Modrinth modpack
  fastify.post('/:shortName/modpacks/install', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    if (!SHORT_NAME_RE.test(shortName)) {
      return reply.code(400).send({ success: false, error: 'Nieprawidłowa nazwa serwera' })
    }
    const body = z.object({
      modpackSlug: z.string().min(1).max(100),
      versionId: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Nieprawidłowe dane' })
    }
    reply.code(202).send({ success: true, data: { message: 'Instalacja modpacku rozpoczęta' } })
    setImmediate(async () => {
      try {
        await installModpack(shortName, body.data.modpackSlug, body.data.versionId)
      } catch (err) {
        console.error(`[GameServers] Modpack install failed for ${shortName}:`, err)
      }
    })
  })

  // GET /api/game-servers/:shortName/modpacks/status — modpack install progress
  fastify.get('/:shortName/modpacks/status', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.params as { shortName: string }
    if (!SHORT_NAME_RE.test(shortName)) {
      return reply.code(400).send({ success: false, error: 'Nieprawidłowa nazwa serwera' })
    }
    const status = await readInstallStatus(`modpack-${shortName}`)
    return reply.send({ success: true, data: status })
  })
}
