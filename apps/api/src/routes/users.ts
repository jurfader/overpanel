import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, adminOnly, getRequestUser } from '../middleware/auth.js'

export async function usersRoutes(fastify: FastifyInstance) {
  // GET /api/users — lista (tylko admin)
  fastify.get('/', { preHandler: [adminOnly] }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, company: true,
        role: true, isActive: true, createdAt: true,
        _count: { select: { sites: true, databases: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ success: true, data: users })
  })

  // POST /api/users — utwórz (tylko admin)
  fastify.post('/', { preHandler: [adminOnly] }, async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(2),
      company: z.string().optional(),
      role: z.enum(['admin', 'client']).default('client'),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    const exists = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (exists) return reply.code(409).send({ success: false, error: 'Email already exists' })

    const passwordHash = await bcrypt.hash(body.data.password, 12)
    if (!body.data.email) return reply.code(400).send({ success: false, error: 'Email wymagany' })
    const user = await prisma.user.create({
      data: {
        email: body.data.email,
        name: body.data.name,
        company: body.data.company,
        role: body.data.role,
        passwordHash,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })

    return reply.code(201).send({ success: true, data: user })
  })

  // PATCH /api/users/:id — edytuj (admin lub właściciel)
  fastify.patch('/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    // Klient może edytować tylko siebie
    if (caller.role !== 'admin' && caller.id !== id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const schema = z.object({
      name: z.string().min(2).optional(),
      company: z.string().optional(),
      isActive: z.boolean().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    const user = await prisma.user.update({
      where: { id },
      data: body.data,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    })
    return reply.send({ success: true, data: user })
  })

  // DELETE /api/users/:id — usuń (tylko admin)
  fastify.delete('/:id', { preHandler: [adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)
    if (caller.id === id) return reply.code(400).send({ success: false, error: 'Cannot delete yourself' })

    await prisma.user.delete({ where: { id } })
    return reply.send({ success: true, data: null })
  })

  // POST /api/users/:id/assign-site — przypisz stronę do użytkownika (tylko admin)
  fastify.post('/:id/assign-site', { preHandler: [adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const bodySchema = z.object({ siteId: z.string() })
    const body = bodySchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'siteId is required' })

    const targetUser = await prisma.user.findUnique({ where: { id } })
    if (!targetUser) return reply.code(404).send({ success: false, error: 'User not found' })

    const site = await prisma.site.findUnique({ where: { id: body.data.siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })

    await prisma.site.update({
      where: { id: body.data.siteId },
      data: { userId: id },
    })

    await prisma.ftpUser.updateMany({
      where: { siteId: body.data.siteId },
      data: { userId: id },
    })

    return reply.send({ success: true, data: null })
  })

  // POST /api/users/:id/assign-db — przypisz bazę danych do użytkownika (tylko admin)
  fastify.post('/:id/assign-db', { preHandler: [adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const bodySchema = z.object({ databaseId: z.string() })
    const body = bodySchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'databaseId is required' })

    const targetUser = await prisma.user.findUnique({ where: { id } })
    if (!targetUser) return reply.code(404).send({ success: false, error: 'User not found' })

    const database = await prisma.database.findUnique({ where: { id: body.data.databaseId } })
    if (!database) return reply.code(404).send({ success: false, error: 'Database not found' })

    await prisma.database.update({
      where: { id: body.data.databaseId },
      data: { userId: id },
    })

    return reply.send({ success: true, data: null })
  })
}
