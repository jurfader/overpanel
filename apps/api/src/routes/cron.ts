import type { FastifyInstance } from 'fastify'
import { writeFile, unlink } from 'fs/promises'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, adminOnly, getRequestUser } from '../middleware/auth.js'

const CRON_D_DIR = '/etc/cron.d'

const scheduleRegex =
  /^(\*|[0-9,\-\/\*]+)\s+(\*|[0-9,\-\/\*]+)\s+(\*|[0-9,\-\/\*]+)\s+(\*|[0-9,\-\/\*]+)\s+(\*|[0-9,\-\/\*]+)$/

const commandRegex = /^[^;&|`$()]+$/

const createCronSchema = z.object({
  name: z.string().min(1).max(100),
  schedule: z.string().regex(scheduleRegex, 'Invalid cron schedule expression'),
  command: z
    .string()
    .min(1)
    .regex(commandRegex, 'Command contains forbidden characters (; & | ` $ ( ))'),
  siteId: z.string().optional(),
})

const updateCronSchema = z.object({
  isActive: z.boolean().optional(),
  schedule: z.string().regex(scheduleRegex, 'Invalid cron schedule expression').optional(),
  command: z
    .string()
    .min(1)
    .regex(commandRegex, 'Command contains forbidden characters (; & | ` $ ( ))')
    .optional(),
})

async function writeCronFile(jobId: string, schedule: string, command: string): Promise<void> {
  const filePath = `${CRON_D_DIR}/overpanel-${jobId}`
  const content = `# OVERPANEL managed cron job\n${schedule} www-data ${command}\n`
  await writeFile(filePath, content, { mode: 0o644 })
}

async function removeCronFile(jobId: string): Promise<void> {
  const filePath = `${CRON_D_DIR}/overpanel-${jobId}`
  try {
    await unlink(filePath)
  } catch {
    // File may not exist — ignore
  }
}

export async function cronRoutes(fastify: FastifyInstance) {
  // GET /api/cron — list cron jobs (admin: all, client: own)
  fastify.get('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const where = caller.role === 'admin' ? {} : { userId: caller.id }

    const jobs = await prisma.cronJob.findMany({
      where,
      include: {
        site: { select: { id: true, domain: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({ success: true, data: jobs })
  })

  // POST /api/cron — create cron job
  fastify.post('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)

    const body = createCronSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const { name, schedule, command, siteId } = body.data

    // If siteId provided, verify ownership
    if (siteId) {
      const site = await prisma.site.findUnique({ where: { id: siteId } })
      if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
      if (caller.role !== 'admin' && site.userId !== caller.id) {
        return reply.code(403).send({ success: false, error: 'Forbidden' })
      }
    }

    const job = await prisma.cronJob.create({
      data: {
        name,
        schedule,
        command,
        isActive: true,
        userId: caller.id,
        siteId: siteId ?? null,
      },
    })

    // Write cron.d file
    try {
      await writeCronFile(job.id, schedule, command)
    } catch (err: any) {
      fastify.log.error(`Failed to write cron file for job ${job.id}: ${err.message}`)
    }

    return reply.code(201).send({ success: true, data: job })
  })

  // PATCH /api/cron/:id — update cron job
  fastify.patch('/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    const existing = await prisma.cronJob.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ success: false, error: 'Cron job not found' })
    if (caller.role !== 'admin' && existing.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const body = updateCronSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const updated = await prisma.cronJob.update({
      where: { id },
      data: body.data,
    })

    const effectiveSchedule = updated.schedule
    const effectiveCommand = updated.command

    if (updated.isActive) {
      // Write / refresh cron.d file
      try {
        await writeCronFile(id, effectiveSchedule, effectiveCommand)
      } catch (err: any) {
        fastify.log.error(`Failed to write cron file for job ${id}: ${err.message}`)
      }
    } else {
      // Remove cron.d file when deactivated
      try {
        await removeCronFile(id)
      } catch (err: any) {
        fastify.log.error(`Failed to remove cron file for job ${id}: ${err.message}`)
      }
    }

    return reply.send({ success: true, data: updated })
  })

  // DELETE /api/cron/:id — delete cron job
  fastify.delete('/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    const existing = await prisma.cronJob.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ success: false, error: 'Cron job not found' })
    if (caller.role !== 'admin' && existing.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    await prisma.cronJob.delete({ where: { id } })

    try {
      await removeCronFile(id)
    } catch (err: any) {
      fastify.log.error(`Failed to remove cron file for job ${id}: ${err.message}`)
    }

    return reply.send({ success: true, data: null })
  })
}
