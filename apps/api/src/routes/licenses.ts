/**
 * OverCMS License Management — proxy to central License Server.
 * ONLY works if LICENSE_ADMIN_SECRET is set in .env (your install only).
 * Other OVERPANEL installations won't have this secret → 404.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { adminOnly } from '../middleware/auth.js'
import { prisma } from '@overpanel/db'

async function getLicenseServerConfig(): Promise<{ url: string; secret: string } | null> {
  const secret = process.env.LICENSE_ADMIN_SECRET
  if (!secret) return null // Not configured → feature disabled

  const row = await prisma.setting.findUnique({ where: { key: 'overcms_license_server_url' } })
  const url = row?.value || process.env.OVERCMS_LICENSE_SERVER_URL || 'http://51.38.137.199:3002'

  return { url: url.replace(/\/$/, ''), secret }
}

async function proxyToLicenseServer(
  path: string,
  method: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const config = await getLicenseServerConfig()
  if (!config) return { status: 404, data: { success: false, error: 'License management not available' } }

  const res = await fetch(`${config.url}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${config.secret}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const raw: any = await res.json().catch(() => ({}))
  // Wrap in { success, data } format expected by frontend
  if (res.ok) {
    return { status: res.status, data: { success: true, data: raw.data ?? raw } }
  }
  return { status: res.status, data: { success: false, error: raw.error ?? 'License server error' } }
}

export async function licensesRoutes(fastify: FastifyInstance) {
  // Guard: if no LICENSE_ADMIN_SECRET, don't register routes
  if (!process.env.LICENSE_ADMIN_SECRET) {
    return
  }

  // GET /api/licenses — list all licenses
  fastify.get('/', { preHandler: [adminOnly] }, async (_req, reply) => {
    const result = await proxyToLicenseServer('/admin/licenses', 'GET')
    return reply.code(result.status).send(result.data)
  })

  // GET /api/licenses/stats — license stats
  fastify.get('/stats', { preHandler: [adminOnly] }, async (_req, reply) => {
    const result = await proxyToLicenseServer('/admin/stats', 'GET')
    return reply.code(result.status).send(result.data)
  })

  // GET /api/licenses/:key — single license details
  fastify.get('/:key', { preHandler: [adminOnly] }, async (request, reply) => {
    const { key } = request.params as { key: string }
    const result = await proxyToLicenseServer(`/admin/licenses/${encodeURIComponent(key)}`, 'GET')
    return reply.code(result.status).send(result.data)
  })

  // POST /api/licenses — create new license
  fastify.post('/', { preHandler: [adminOnly] }, async (request, reply) => {
    const schema = z.object({
      plan: z.enum(['trial', 'solo', 'agency']).default('trial'),
      buyerEmail: z.string().email(),
      buyerName: z.string().optional(),
      maxInstallations: z.number().int().positive().optional(),
      expiresAt: z.string().optional(),
      notes: z.string().optional(),
      sendEmail: z.boolean().default(false),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    const result = await proxyToLicenseServer('/admin/licenses', 'POST', body.data)
    return reply.code(result.status).send(result.data)
  })

  // PATCH /api/licenses/:key — update license
  fastify.patch('/:key', { preHandler: [adminOnly] }, async (request, reply) => {
    const { key } = request.params as { key: string }
    const result = await proxyToLicenseServer(`/admin/licenses/${encodeURIComponent(key)}`, 'PATCH', request.body)
    return reply.code(result.status).send(result.data)
  })

  // DELETE /api/licenses/:key — revoke license
  fastify.delete('/:key', { preHandler: [adminOnly] }, async (request, reply) => {
    const { key } = request.params as { key: string }
    const result = await proxyToLicenseServer(`/admin/licenses/${encodeURIComponent(key)}`, 'DELETE')
    return reply.code(result.status).send(result.data)
  })

  // POST /api/licenses/:key/resend-email
  fastify.post('/:key/resend-email', { preHandler: [adminOnly] }, async (request, reply) => {
    const { key } = request.params as { key: string }
    const result = await proxyToLicenseServer(`/admin/licenses/${encodeURIComponent(key)}/resend-email`, 'POST')
    return reply.code(result.status).send(result.data)
  })

  // POST /api/licenses/:key/activate — proxy activation to license server
  fastify.post('/:key/activate', { preHandler: [adminOnly] }, async (request, reply) => {
    const { key } = request.params as { key: string }
    const body = request.body as Record<string, unknown> ?? {}
    const result = await proxyToLicenseServer('/activate', 'POST', {
      licenseKey: key,
      domain: body.domain,
      installationId: body.installationId ?? body.installId,
    })
    return reply.code(result.status).send(result.data)
  })

  // POST /api/licenses/:key/validate — proxy validation to license server
  fastify.post('/:key/validate', { preHandler: [adminOnly] }, async (request, reply) => {
    const { key } = request.params as { key: string }
    const body = request.body as Record<string, unknown> ?? {}
    const result = await proxyToLicenseServer('/validate', 'POST', {
      licenseKey: key,
      domain: body.domain,
      installationId: body.installationId ?? body.installId,
    })
    return reply.code(result.status).send(result.data)
  })
}
