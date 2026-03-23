import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, getRequestUser } from '../middleware/auth.js'

export async function openclawRoutes(fastify: FastifyInstance) {
  // GET /api/openclaw/:siteId/config — get OpenClaw config (secrets masked)
  fastify.get('/:siteId/config', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const caller = getRequestUser(request)
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site || site.siteType !== 'openclaw') return reply.code(404).send({ success: false, error: 'Not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const { getOpenClawConfig } = await import('../services/openclaw.js')
    const config = await getOpenClawConfig(site.domain)
    if (!config) return reply.send({ success: true, data: null })

    // Mask secrets
    const masked = { ...config }
    if (typeof masked.openaiApiKey === 'string') masked.openaiApiKey = masked.openaiApiKey.slice(0, 8) + '...'
    if (typeof masked.anthropicApiKey === 'string') masked.anthropicApiKey = masked.anthropicApiKey.slice(0, 8) + '...'
    const tg = masked.telegram as Record<string, string> | undefined
    if (tg?.botToken) tg.botToken = tg.botToken.slice(0, 8) + '...'
    const dc = masked.discord as Record<string, string> | undefined
    if (dc?.botToken) dc.botToken = dc.botToken.slice(0, 8) + '...'
    const sl = masked.slack as Record<string, string> | undefined
    if (sl?.botToken) sl.botToken = sl.botToken.slice(0, 8) + '...'

    return reply.send({ success: true, data: masked })
  })

  // PUT /api/openclaw/:siteId/config — update config and restart
  fastify.put('/:siteId/config', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const caller = getRequestUser(request)
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site || site.siteType !== 'openclaw') return reply.code(404).send({ success: false, error: 'Not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const schema = z.object({
      openaiApiKey: z.string().optional(),
      anthropicApiKey: z.string().optional(),
      telegramToken: z.string().optional(),
      discordToken: z.string().optional(),
      slackToken: z.string().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    const { getOpenClawConfig, updateOpenClawConfig } = await import('../services/openclaw.js')
    const current = await getOpenClawConfig(site.domain) ?? {}

    // Merge — only update fields that were provided (not ending with '...')
    if (body.data.openaiApiKey && !body.data.openaiApiKey.endsWith('...')) current.openaiApiKey = body.data.openaiApiKey
    if (body.data.anthropicApiKey && !body.data.anthropicApiKey.endsWith('...')) current.anthropicApiKey = body.data.anthropicApiKey
    if (body.data.telegramToken && !body.data.telegramToken.endsWith('...')) {
      current.telegram = { ...(current.telegram as Record<string, unknown> ?? {}), botToken: body.data.telegramToken }
    }
    if (body.data.discordToken && !body.data.discordToken.endsWith('...')) {
      current.discord = { ...(current.discord as Record<string, unknown> ?? {}), botToken: body.data.discordToken }
    }
    if (body.data.slackToken && !body.data.slackToken.endsWith('...')) {
      current.slack = { ...(current.slack as Record<string, unknown> ?? {}), botToken: body.data.slackToken }
    }

    await updateOpenClawConfig(site.domain, current)
    return reply.send({ success: true, data: { message: 'Konfiguracja zaktualizowana, gateway zrestartowany' } })
  })

  // GET /api/openclaw/:siteId/status — gateway health
  fastify.get('/:siteId/status', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site || site.siteType !== 'openclaw') return reply.code(404).send({ success: false, error: 'Not found' })

    const { isOpenClawRunning } = await import('../services/openclaw.js')
    const running = await isOpenClawRunning(site.domain)

    return reply.send({ success: true, data: { running } })
  })
}
