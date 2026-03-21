import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { adminOnly } from '../middleware/auth.js'
import {
  listDisks,
  getDiskUsage,
  formatPartition,
  mountPartition,
  unmountPartition,
  addToFstab,
  removeFromFstab,
} from '../services/disk.js'

const formatSchema = z.object({
  partition: z.string().min(1).regex(/^[a-z]+[0-9]*p?[0-9]+$/, 'Invalid partition name'),
  fstype: z.enum(['ext4', 'xfs']),
})

const mountSchema = z.object({
  partition: z.string().min(1).regex(/^[a-z]+[0-9]*p?[0-9]+$/, 'Invalid partition name'),
  mountpoint: z.string().min(1).startsWith('/mnt/', 'Mountpoint must be under /mnt/'),
})

const unmountSchema = z.object({
  mountpoint: z.string().min(1).startsWith('/mnt/', 'Cannot unmount system path'),
})

const fstabAddSchema = z.object({
  partition: z.string().min(1).regex(/^[a-z]+[0-9]*p?[0-9]+$/, 'Invalid partition name'),
  mountpoint: z.string().min(1).startsWith('/mnt/', 'Mountpoint must be under /mnt/'),
  fstype: z.enum(['ext4', 'xfs']),
})

const fstabRemoveSchema = z.object({
  mountpoint: z.string().min(1).startsWith('/mnt/', 'Cannot remove system fstab entry'),
})

export async function disksRoutes(fastify: FastifyInstance) {
  // GET /api/disks — list all block devices
  fastify.get('/', { preHandler: [adminOnly] }, async (_request, reply) => {
    try {
      const data = await listDisks()
      return reply.send({ success: true, data })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // GET /api/disks/usage — disk usage (df)
  fastify.get('/usage', { preHandler: [adminOnly] }, async (_request, reply) => {
    try {
      const data = await getDiskUsage()
      return reply.send({ success: true, data })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/disks/format — format a partition
  fastify.post('/format', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = formatSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    try {
      await formatPartition(body.data.partition, body.data.fstype)
      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/disks/mount — mount a partition
  fastify.post('/mount', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = mountSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    try {
      await mountPartition(body.data.partition, body.data.mountpoint)
      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/disks/unmount — unmount a partition
  fastify.post('/unmount', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = unmountSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    try {
      await unmountPartition(body.data.mountpoint)
      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/disks/fstab — add entry to fstab
  fastify.post('/fstab', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = fstabAddSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    try {
      await addToFstab(body.data.partition, body.data.mountpoint, body.data.fstype)
      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // DELETE /api/disks/fstab — remove entry from fstab
  fastify.delete('/fstab', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = fstabRemoveSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    try {
      await removeFromFstab(body.data.mountpoint)
      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })
}
