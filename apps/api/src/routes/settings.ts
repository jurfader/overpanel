import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { prisma } from '@overpanel/db'
import { adminOnly, getRequestUser } from '../middleware/auth.js'

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return row?.value ?? null
}

async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}

async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

// ── All setting keys exposed via the API ──────────────────────────────────────

const SETTING_KEYS = [
  'panel_name',
  'panel_url',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_from',
  'smtp_secure',
  'backup_retention_days',
  'max_sites_per_user',
  'max_dbs_per_user',
  'cf_global_token',
  's3_endpoint',
  's3_bucket',
  's3_access_key',
  's3_secret_key',
  's3_region',
  'panel_logo_url',
  'panel_favicon_url',
] as const

// ── Route handler ─────────────────────────────────────────────────────────────

export async function settingsRoutes(fastify: FastifyInstance) {
  // GET /api/settings — return all settings as key-value object
  fastify.get('/', { preHandler: [adminOnly] }, async (_request, reply) => {
    const data = await getSettings([...SETTING_KEYS])
    return reply.send({ success: true, data })
  })

  // POST /api/settings — update settings
  fastify.post('/', { preHandler: [adminOnly] }, async (request, reply) => {
    const bodySchema = z.object({
      panel_name: z.string().optional(),
      panel_url: z.string().optional(),
      smtp_host: z.string().optional(),
      smtp_port: z
        .string()
        .regex(/^\d+$/, 'smtp_port must be a numeric string')
        .optional(),
      smtp_user: z.string().optional(),
      smtp_password: z.string().optional(),
      smtp_from: z.string().optional(),
      smtp_secure: z.string().optional(),
      backup_retention_days: z
        .string()
        .regex(/^\d+$/, 'backup_retention_days must be numeric')
        .optional(),
      max_sites_per_user: z.string().optional(),
      max_dbs_per_user: z.string().optional(),
      cf_global_token: z.string().optional(),
      s3_endpoint: z.string().optional(),
      s3_bucket: z.string().optional(),
      s3_access_key: z.string().optional(),
      s3_secret_key: z.string().optional(),
      s3_region: z.string().optional(),
      panel_logo_url: z.string().optional(),
      panel_favicon_url: z.string().optional(),
    })

    const parsed = bodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: parsed.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const updates = parsed.data
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        await setSetting(key, value)
      }
    }

    const data = await getSettings([...SETTING_KEYS])
    return reply.send({ success: true, data })
  })

  // GET /api/settings/test-smtp — test SMTP connection (placeholder)
  fastify.get('/test-smtp', { preHandler: [adminOnly] }, async (_request, reply) => {
    const host = await getSetting('smtp_host')

    if (!host) {
      return reply.send({ success: false, error: 'SMTP not configured' })
    }

    // Placeholder — full SMTP test not yet implemented
    return reply.send({ success: false, error: 'SMTP test not configured' })
  })

  // POST /api/settings/change-password
  fastify.post('/change-password', { preHandler: [adminOnly] }, async (request, reply) => {
    const bodySchema = z.object({
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8, 'New password must be at least 8 characters'),
      userId: z.string().optional(),
    })

    const parsed = bodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: parsed.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const { currentPassword, newPassword, userId } = parsed.data
    const caller = getRequestUser(request)

    if (userId) {
      // Admin changing another user's password — no currentPassword check needed
      const target = await prisma.user.findUnique({ where: { id: userId } })
      if (!target) return reply.code(404).send({ success: false, error: 'User not found' })

      const hash = await bcrypt.hash(newPassword, 12)
      await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } })

      return reply.send({ success: true, data: null })
    }

    // Admin changing own password — verify current password
    const self = await prisma.user.findUnique({ where: { id: caller.id } })
    if (!self) return reply.code(404).send({ success: false, error: 'User not found' })

    if (!currentPassword) {
      return reply.code(400).send({ success: false, error: 'Current password is required' })
    }

    const valid = await bcrypt.compare(currentPassword, self.passwordHash)
    if (!valid) {
      return reply.code(401).send({ success: false, error: 'Current password incorrect' })
    }

    const hash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: self.id }, data: { passwordHash: hash } })

    return reply.send({ success: true, data: null })
  })

  // GET /api/settings/audit-log — last 100 audit log entries
  fastify.get('/audit-log', { preHandler: [adminOnly] }, async (_request, reply) => {
    const entries = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        resource: true,
        resourceId: true,
        meta: true,
        ip: true,
        createdAt: true,
        user: {
          select: { name: true, email: true },
        },
      },
    })

    return reply.send({ success: true, data: entries })
  })
}
