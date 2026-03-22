import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { adminOnly, authMiddleware, getRequestUser } from '../middleware/auth.js'
import { prisma } from '@overpanel/db'
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
  })

  fastify.post('/install', { preHandler: [authMiddleware] }, async (request, reply) => {
    const body = installSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }
    const { shortName, serverName, domain, port, maxPlayers, password } = body.data
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
}
