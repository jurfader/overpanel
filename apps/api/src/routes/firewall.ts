import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { adminOnly } from '../middleware/auth.js'
import {
  getUfwStatus,
  addUfwRule,
  deleteUfwRule,
  enableUfw,
  disableUfw,
} from '../services/ufw.js'

const addRuleSchema = z.object({
  port: z.string().min(1),
  protocol: z.enum(['tcp', 'udp', 'any']),
  action: z.enum(['allow', 'deny', 'reject']),
  from: z.string().optional(),
})

export async function firewallRoutes(fastify: FastifyInstance) {
  // GET /api/firewall — get UFW status and rules
  fastify.get('/', { preHandler: [adminOnly] }, async (_request, reply) => {
    try {
      const status = await getUfwStatus()
      return reply.send({ success: true, data: status })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/firewall/enable — enable UFW
  fastify.post('/enable', { preHandler: [adminOnly] }, async (_request, reply) => {
    try {
      await enableUfw()
      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/firewall/disable — disable UFW
  fastify.post('/disable', { preHandler: [adminOnly] }, async (_request, reply) => {
    try {
      await disableUfw()
      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/firewall/rules — add a UFW rule
  fastify.post('/rules', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = addRuleSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    try {
      await addUfwRule(body.data)
      return reply.code(201).send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // DELETE /api/firewall/rules/:number — delete a UFW rule by number
  fastify.delete('/rules/:number', { preHandler: [adminOnly] }, async (request, reply) => {
    const { number } = request.params as { number: string }
    const ruleNumber = parseInt(number, 10)

    if (isNaN(ruleNumber) || ruleNumber < 1) {
      return reply.code(400).send({ success: false, error: 'Invalid rule number' })
    }

    try {
      await deleteUfwRule(ruleNumber)
      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })
}
