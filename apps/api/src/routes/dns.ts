import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, getRequestUser } from '../middleware/auth.js'
import {
  listZones,
  listDnsRecords,
  createDnsRecord,
  updateDnsRecord,
  replaceDnsRecord,
  deleteDnsRecord,
  findZoneForDomain,
  getPublicIp,
  CloudflareError,
} from '../services/cloudflare.js'

// Helper — pobierz token CF dla usera (jego własny lub globalny)
async function getCfToken(userId: string): Promise<string | null> {
  const token = await prisma.cloudflareToken.findFirst({
    where: { userId, isDefault: true },
    select: { token: true },
  })
  return token?.token ?? process.env.CLOUDFLARE_API_TOKEN ?? null
}

export async function dnsRoutes(fastify: FastifyInstance) {
  // GET /api/dns/zones — lista stref CF dostępnych dla usera
  fastify.get('/zones', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const token = await getCfToken(caller.id)
    if (!token) return reply.code(400).send({ success: false, error: 'Brak skonfigurowanego tokenu Cloudflare' })

    try {
      const zones = await listZones(token)
      return reply.send({ success: true, data: zones })
    } catch (err) {
      if (err instanceof CloudflareError) return reply.code(502).send({ success: false, error: err.message })
      throw err
    }
  })

  // GET /api/dns/zones/:zoneId/records
  fastify.get('/zones/:zoneId/records', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { zoneId } = request.params as { zoneId: string }
    const caller = getRequestUser(request)
    const token = await getCfToken(caller.id)
    if (!token) return reply.code(400).send({ success: false, error: 'Brak tokenu Cloudflare' })

    try {
      const records = await listDnsRecords(token, zoneId)
      return reply.send({ success: true, data: records })
    } catch (err) {
      if (err instanceof CloudflareError) return reply.code(502).send({ success: false, error: err.message })
      throw err
    }
  })

  // POST /api/dns/zones/:zoneId/records
  fastify.post('/zones/:zoneId/records', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { zoneId } = request.params as { zoneId: string }
    const schema = z.object({
      type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'CAA', 'NS']),
      name: z.string().min(1),
      content: z.string().min(1),
      ttl: z.number().int().min(1).default(3600),
      proxied: z.boolean().default(false),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    const caller = getRequestUser(request)
    const token = await getCfToken(caller.id)
    if (!token) return reply.code(400).send({ success: false, error: 'Brak tokenu Cloudflare' })

    try {
      const record = await createDnsRecord(token, zoneId, body.data as any)
      return reply.code(201).send({ success: true, data: record })
    } catch (err) {
      if (err instanceof CloudflareError) return reply.code(502).send({ success: false, error: err.message })
      throw err
    }
  })

  // PATCH /api/dns/zones/:zoneId/records/:recordId
  fastify.patch('/zones/:zoneId/records/:recordId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { zoneId, recordId } = request.params as { zoneId: string; recordId: string }
    const schema = z.object({
      content: z.string().optional(),
      ttl: z.number().optional(),
      proxied: z.boolean().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    const caller = getRequestUser(request)
    const token = await getCfToken(caller.id)
    if (!token) return reply.code(400).send({ success: false, error: 'Brak tokenu Cloudflare' })

    try {
      const record = await updateDnsRecord(token, zoneId, recordId, body.data)
      return reply.send({ success: true, data: record })
    } catch (err) {
      if (err instanceof CloudflareError) return reply.code(502).send({ success: false, error: err.message })
      throw err
    }
  })

  // PUT /api/dns/zones/:zoneId/records/:recordId — pełna aktualizacja rekordu
  fastify.put('/zones/:zoneId/records/:recordId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { zoneId, recordId } = request.params as { zoneId: string; recordId: string }
    const schema = z.object({
      type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'CAA', 'NS']),
      name: z.string().min(1),
      content: z.string().min(1),
      ttl: z.number().int().min(1).default(3600),
      proxied: z.boolean().default(false),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    const caller = getRequestUser(request)
    const token = await getCfToken(caller.id)
    if (!token) return reply.code(400).send({ success: false, error: 'Brak tokenu Cloudflare' })

    try {
      const record = await replaceDnsRecord(token, zoneId, recordId, body.data as any)
      return reply.send({ success: true, data: record })
    } catch (err) {
      if (err instanceof CloudflareError) return reply.code(502).send({ success: false, error: err.message })
      throw err
    }
  })

  // DELETE /api/dns/zones/:zoneId/records/:recordId
  fastify.delete('/zones/:zoneId/records/:recordId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { zoneId, recordId } = request.params as { zoneId: string; recordId: string }
    const caller = getRequestUser(request)
    const token = await getCfToken(caller.id)
    if (!token) return reply.code(400).send({ success: false, error: 'Brak tokenu Cloudflare' })

    try {
      await deleteDnsRecord(token, zoneId, recordId)
      return reply.send({ success: true, data: null })
    } catch (err) {
      if (err instanceof CloudflareError) return reply.code(502).send({ success: false, error: err.message })
      throw err
    }
  })

  // POST /api/dns/tokens — zapisz CF token usera
  fastify.post('/tokens', { preHandler: [authMiddleware] }, async (request, reply) => {
    const schema = z.object({
      label: z.string().min(1),
      token: z.string().min(10),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    const caller = getRequestUser(request)

    // Weryfikuj token przez API
    try {
      await listZones(body.data.token)
    } catch {
      return reply.code(400).send({ success: false, error: 'Token Cloudflare jest nieprawidłowy lub brak uprawnień do stref' })
    }

    // Dezaktywuj poprzednie tokeny
    await prisma.cloudflareToken.updateMany({
      where: { userId: caller.id },
      data: { isDefault: false },
    })

    const saved = await prisma.cloudflareToken.create({
      data: { label: body.data.label, token: body.data.token, userId: caller.id, isDefault: true },
      select: { id: true, label: true, isDefault: true, createdAt: true },
    })

    return reply.code(201).send({ success: true, data: saved })
  })

  // GET /api/dns/tokens — lista tokenów usera
  fastify.get('/tokens', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const tokens = await prisma.cloudflareToken.findMany({
      where: { userId: caller.id },
      select: { id: true, label: true, isDefault: true, createdAt: true },
    })
    return reply.send({ success: true, data: tokens })
  })

  // DELETE /api/dns/tokens/:id
  fastify.delete('/tokens/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)
    await prisma.cloudflareToken.deleteMany({ where: { id, userId: caller.id } })
    return reply.send({ success: true, data: null })
  })

  // POST /api/dns/auto-record — auto-dodaj rekord A dla domeny
  fastify.post('/auto-record', { preHandler: [authMiddleware] }, async (request, reply) => {
    const schema = z.object({ domain: z.string(), proxied: z.boolean().default(true) })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    const caller = getRequestUser(request)
    const token = await getCfToken(caller.id)
    if (!token) return reply.code(400).send({ success: false, error: 'Brak tokenu Cloudflare' })

    try {
      const zone = await findZoneForDomain(token, body.data.domain)
      if (!zone) return reply.code(404).send({ success: false, error: 'Domena nie znaleziona w Cloudflare' })

      const ip = await getPublicIp()
      const record = await createDnsRecord(token, zone.id, {
        type: 'A',
        name: body.data.domain,
        content: ip,
        ttl: 1, // auto TTL (Cloudflare)
        proxied: body.data.proxied,
      })

      return reply.code(201).send({ success: true, data: { record, serverIp: ip } })
    } catch (err) {
      if (err instanceof CloudflareError) return reply.code(502).send({ success: false, error: err.message })
      throw err
    }
  })
}
