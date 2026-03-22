import type { FastifyInstance } from 'fastify'
import { adminOnly } from '../middleware/auth.js'
import {
  GAME_SERVER_TEMPLATES,
  installGameServer,
  startGameServer,
  stopGameServer,
  restartGameServer,
  getGameServerStatus,
  getInstalledServers,
  uninstallGameServer,
  readInstallStatus,
} from '../services/game-servers.js'

export async function gameServersRoutes(fastify: FastifyInstance) {

  // GET /api/game-servers — list all templates + installed status
  fastify.get('/', { preHandler: [adminOnly] }, async (_req, reply) => {
    try {
      const installed = await getInstalledServers()
      const templates = GAME_SERVER_TEMPLATES.map(t => ({
        ...t,
        installed: installed.includes(t.shortName),
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
        installed.map(async (shortName) => {
          const template = GAME_SERVER_TEMPLATES.find(t => t.shortName === shortName)
          const status = await getGameServerStatus(shortName).catch(() => ({ running: false }))
          return {
            shortName,
            name: template?.name ?? shortName,
            category: template?.category ?? 'Inne',
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
  fastify.post('/install', { preHandler: [adminOnly] }, async (request, reply) => {
    const { shortName } = request.body as { shortName: string }

    if (!shortName || !/^[a-z0-9]+$/.test(shortName)) {
      return reply.code(400).send({ success: false, error: 'Nieprawidłowa nazwa serwera' })
    }

    const template = GAME_SERVER_TEMPLATES.find(t => t.shortName === shortName)
    if (!template) {
      return reply.code(404).send({ success: false, error: 'Szablon serwera nie znaleziony' })
    }

    // Check if already installed
    const installed = await getInstalledServers()
    if (installed.includes(shortName)) {
      return reply.code(409).send({ success: false, error: 'Serwer już zainstalowany' })
    }

    // Start async install
    reply.code(202).send({ success: true, data: { message: 'Instalacja rozpoczęta', shortName } })

    setImmediate(async () => {
      try {
        await installGameServer(shortName)
        console.log(`[GameServers] Installed ${shortName}`)
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
}
