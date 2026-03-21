import type { FastifyInstance } from 'fastify'
import { prisma } from '@overpanel/db'
import { authMiddleware, adminOnly, getRequestUser } from '../middleware/auth.js'
import {
  getNginxAccessLog,
  getNginxErrorLog,
  getSystemLog,
  getPhpFpmLog,
} from '../services/logs.js'

export async function logsRoutes(fastify: FastifyInstance) {
  // GET /api/logs/sites — list sites (admin: all, client: own)
  fastify.get('/sites', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const where = caller.role === 'admin' ? {} : { userId: caller.id }

    const sites = await prisma.site.findMany({
      where,
      select: { id: true, domain: true },
      orderBy: { domain: 'asc' },
    })

    return reply.send({ success: true, data: { sites } })
  })

  // GET /api/logs/nginx/:siteId/access?lines=200
  fastify.get('/nginx/:siteId/access', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const { lines } = request.query as { lines?: string }
    const caller = getRequestUser(request)

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, domain: true, userId: true },
    })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    try {
      const logLines = await getNginxAccessLog(site.domain, lines ? parseInt(lines, 10) : 200)
      return reply.send({
        success: true,
        data: { lines: logLines, site: { domain: site.domain } },
      })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // GET /api/logs/nginx/:siteId/error?lines=200
  fastify.get('/nginx/:siteId/error', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const { lines } = request.query as { lines?: string }
    const caller = getRequestUser(request)

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, domain: true, userId: true },
    })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    try {
      const logLines = await getNginxErrorLog(site.domain, lines ? parseInt(lines, 10) : 200)
      return reply.send({
        success: true,
        data: { lines: logLines, site: { domain: site.domain } },
      })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // GET /api/logs/system?lines=200 — admin only
  fastify.get('/system', { preHandler: [adminOnly] }, async (request, reply) => {
    const { lines } = request.query as { lines?: string }

    try {
      const logLines = await getSystemLog(lines ? parseInt(lines, 10) : 200)
      return reply.send({ success: true, data: { lines: logLines } })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // GET /api/logs/php?version=8.3&lines=200 — admin only
  fastify.get('/php', { preHandler: [adminOnly] }, async (request, reply) => {
    const { version, lines } = request.query as { version?: string; lines?: string }

    try {
      const logLines = await getPhpFpmLog(
        version ?? '8.3',
        lines ? parseInt(lines, 10) : 200
      )
      return reply.send({ success: true, data: { lines: logLines } })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })
}
