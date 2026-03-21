import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '@overpanel/db'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid input' })
    }

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user || !user.isActive) {
      return reply.code(401).send({ success: false, error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ success: false, error: 'Invalid credentials' })
    }

    const payload = { id: user.id, email: user.email, role: user.role }
    const accessToken = fastify.jwt.sign(payload, { expiresIn: '7d' })

    // httpOnly cookie + json body (frontend wybiera co użyć)
    reply.setCookie('op_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'user.login',
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
    })

    return reply.send({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        accessToken,
      },
    })
  })

  // POST /api/auth/logout
  fastify.post('/logout', async (_request, reply) => {
    reply.clearCookie('op_token', { path: '/' })
    return reply.send({ success: true, data: null })
  })

  // GET /api/auth/me
  fastify.get(
    '/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const payload = request.user as { id: string }
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, email: true, name: true, role: true, company: true, createdAt: true },
      })
      if (!user) return reply.code(404).send({ success: false, error: 'User not found' })
      return reply.send({ success: true, data: user })
    }
  )

  // POST /api/auth/change-password
  fastify.post(
    '/change-password',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const schema = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

      const payload = request.user as { id: string }
      const user = await prisma.user.findUnique({ where: { id: payload.id } })
      if (!user) return reply.code(404).send({ success: false, error: 'Not found' })

      const valid = await bcrypt.compare(body.data.currentPassword, user.passwordHash)
      if (!valid) return reply.code(401).send({ success: false, error: 'Current password incorrect' })

      const hash = await bcrypt.hash(body.data.newPassword, 12)
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } })

      return reply.send({ success: true, data: null })
    }
  )
}
