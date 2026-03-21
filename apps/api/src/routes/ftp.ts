import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, getRequestUser } from '../middleware/auth.js'
import {
  createFtpUser,
  deleteFtpUser,
  resetFtpPassword,
  isFtpAvailable,
} from '../services/ftp.js'

const createFtpSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .regex(/^[a-z][a-z0-9_]{0,31}$/, 'Username must start with a letter and contain only lowercase letters, numbers, underscores (max 32 chars)'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  siteId: z.string().optional(),
})

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function ftpRoutes(fastify: FastifyInstance) {
  // GET /api/ftp/status — check if pure-ftpd is installed
  fastify.get('/status', { preHandler: [authMiddleware] }, async (_request, reply) => {
    const available = await isFtpAvailable()
    return reply.send({ success: true, data: { available } })
  })

  // GET /api/ftp — list FTP users (admin: all, client: own)
  fastify.get('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const where = caller.role === 'admin' ? {} : { userId: caller.id }

    const ftpUsers = await prisma.ftpUser.findMany({
      where,
      include: { site: { select: { domain: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({ success: true, data: ftpUsers })
  })

  // POST /api/ftp — create FTP user
  fastify.post('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = createFtpSchema.safeParse(request.body)

    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const { username, password, siteId } = body.data

    // Check for duplicate username in DB
    const existing = await prisma.ftpUser.findUnique({ where: { username } })
    if (existing) {
      return reply.code(409).send({ success: false, error: 'FTP username already exists' })
    }

    // Determine home directory
    let homeDir = `/var/www/${username}`
    if (siteId) {
      const site = await prisma.site.findUnique({ where: { id: siteId } })
      if (!site) {
        return reply.code(404).send({ success: false, error: 'Site not found' })
      }
      // Only allow access to sites owned by the caller (unless admin)
      if (caller.role !== 'admin' && site.userId !== caller.id) {
        return reply.code(403).send({ success: false, error: 'Forbidden' })
      }
      homeDir = site.documentRoot
    }

    try {
      await createFtpUser(username, password, homeDir)
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to create FTP user on server',
      })
    }

    const ftpUser = await prisma.ftpUser.create({
      data: {
        username,
        homeDir,
        userId: caller.id,
        siteId: siteId ?? null,
      },
      include: { site: { select: { domain: true } } },
    })

    return reply.code(201).send({ success: true, data: ftpUser })
  })

  // POST /api/ftp/:id/reset-password — reset FTP user password
  fastify.post('/:id/reset-password', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    const ftpUser = await prisma.ftpUser.findUnique({ where: { id } })
    if (!ftpUser) {
      return reply.code(404).send({ success: false, error: 'FTP user not found' })
    }

    if (caller.role !== 'admin' && ftpUser.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const body = resetPasswordSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    try {
      await resetFtpPassword(ftpUser.username, body.data.password)
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to reset FTP password',
      })
    }

    return reply.send({ success: true, data: null })
  })

  // DELETE /api/ftp/:id — delete FTP user
  fastify.delete('/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    const ftpUser = await prisma.ftpUser.findUnique({ where: { id } })
    if (!ftpUser) {
      return reply.code(404).send({ success: false, error: 'FTP user not found' })
    }

    if (caller.role !== 'admin' && ftpUser.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    try {
      await deleteFtpUser(ftpUser.username)
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to delete FTP user from server',
      })
    }

    await prisma.ftpUser.delete({ where: { id } })
    return reply.send({ success: true, data: null })
  })
}
