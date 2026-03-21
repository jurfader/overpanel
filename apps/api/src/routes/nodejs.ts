import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, getRequestUser } from '../middleware/auth.js'
import {
  isPm2Available,
  listApps,
  getApp,
  startApp,
  stopApp,
  restartApp,
  deleteApp,
  getAppLogs,
} from '../services/pm2.js'
import { createNginxNodeProxy, deleteNginxVhost, reloadNginx } from '../services/nginx.js'
import { addDomainToTunnel, removeDomainFromTunnel, isTunnelActive } from '../services/cloudflared.js'

export async function nodejsRoutes(fastify: FastifyInstance) {
  // GET /api/nodejs/status — check if PM2 is available
  fastify.get('/status', { preHandler: [authMiddleware] }, async (_request, reply) => {
    const available = await isPm2Available()
    return reply.send({ success: true, data: { available } })
  })

  // GET /api/nodejs/:siteId — get PM2 app info for a site
  fastify.get('/:siteId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const caller = getRequestUser(request)

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }
    if (site.siteType !== 'nodejs') {
      return reply.code(400).send({ success: false, error: 'Site is not a Node.js app' })
    }

    const app = await getApp(site.domain)
    return reply.send({ success: true, data: { site, app } })
  })

  // GET /api/nodejs/:siteId/logs — PM2 logs
  fastify.get('/:siteId/logs', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const { lines } = request.query as { lines?: string }
    const caller = getRequestUser(request)

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const linesNum = Math.min(Math.max(parseInt(lines ?? '100', 10) || 100, 10), 2000)
    const logs = await getAppLogs(site.domain, linesNum)
    return reply.send({ success: true, data: { logs } })
  })

  // POST /api/nodejs/:siteId/action — start | stop | restart
  fastify.post('/:siteId/action', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const caller = getRequestUser(request)
    const schema = z.object({
      action: z.enum(['start', 'stop', 'restart']),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid action' })
    }

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }
    if (site.siteType !== 'nodejs') {
      return reply.code(400).send({ success: false, error: 'Site is not a Node.js app' })
    }

    try {
      if (body.data.action === 'start') {
        const appPort = site.appPort ?? 3000
        const startCommand = site.startCommand ?? 'server.js'
        await startApp({
          name: site.domain,
          script: startCommand,
          cwd: site.documentRoot,
          port: appPort,
        })
        await prisma.site.update({ where: { id: siteId }, data: { status: 'active' } })
      } else if (body.data.action === 'stop') {
        await stopApp(site.domain)
        await prisma.site.update({ where: { id: siteId }, data: { status: 'inactive' } })
      } else {
        await restartApp(site.domain)
      }
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err?.message ?? 'PM2 error' })
    }

    return reply.send({ success: true, data: null })
  })

  // PATCH /api/nodejs/:siteId — update startCommand and/or appPort
  fastify.patch('/:siteId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const caller = getRequestUser(request)
    const schema = z.object({
      startCommand: z.string().min(1).max(200).optional(),
      appPort: z.number().int().min(1024).max(65535).optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const updated = await prisma.site.update({ where: { id: siteId }, data: body.data })

    // Regenerate nginx config if port changed
    if (body.data.appPort && body.data.appPort !== site.appPort) {
      await createNginxNodeProxy({ domain: site.domain, appPort: body.data.appPort })
      await reloadNginx()
    }

    return reply.send({ success: true, data: updated })
  })

  // DELETE /api/nodejs/:siteId — stop + remove PM2 process
  fastify.delete('/:siteId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const caller = getRequestUser(request)

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    // Delete PM2 process
    await deleteApp(site.domain).catch(() => {})

    // Remove nginx + tunnel
    await deleteNginxVhost(site.domain).catch(() => {})
    await reloadNginx().catch(() => {})

    const tunnelActive = await isTunnelActive()
    if (tunnelActive) {
      await removeDomainFromTunnel(site.domain).catch(() => {})
    }

    // Remove apps from prisma (site record remains — only PM2 process removed)
    await prisma.site.update({ where: { id: siteId }, data: { status: 'inactive' } })

    return reply.send({ success: true, data: null })
  })

  // POST /api/nodejs/:siteId/setup — initial setup (nginx proxy + optional PM2 start)
  fastify.post('/:siteId/setup', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const caller = getRequestUser(request)
    const schema = z.object({
      startNow: z.boolean().default(false),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid input' })
    }

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }
    if (site.siteType !== 'nodejs') {
      return reply.code(400).send({ success: false, error: 'Site is not a Node.js app' })
    }

    const appPort = site.appPort ?? 3000

    // Recreate nginx proxy config
    await createNginxNodeProxy({ domain: site.domain, appPort })
    await reloadNginx()

    if (body.data.startNow) {
      const startCommand = site.startCommand ?? 'server.js'
      await startApp({
        name: site.domain,
        script: startCommand,
        cwd: site.documentRoot,
        port: appPort,
      })
      await prisma.site.update({ where: { id: siteId }, data: { status: 'active' } })
    }

    return reply.send({ success: true, data: { message: 'Node.js app configured' } })
  })
}
