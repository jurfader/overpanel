import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, getRequestUser } from '../middleware/auth.js'
import { createMysqlDatabase, dropMysqlDatabase, dumpMysqlDatabase } from '../services/mysql.js'
import { createPgDatabase, dropPgDatabase, dumpPgDatabase } from '../services/postgresql.js'
import { writeFile, unlink } from 'fs/promises'
import { run, esc } from '../services/shell.js'

const createDbSchema = z.object({
  name: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers, underscores'),
  engine: z.enum(['mysql', 'postgresql']),
  siteId: z.string().optional(),
})

export async function databasesRoutes(fastify: FastifyInstance) {
  // GET /api/databases
  fastify.get('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const where = caller.role === 'admin' ? {} : { userId: caller.id }
    const databases = await prisma.database.findMany({
      where,
      include: { site: { select: { domain: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ success: true, data: databases })
  })

  // POST /api/databases
  fastify.post('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = createDbSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }

    const { name, engine, siteId } = body.data
    const dbUser = `op_${name}`
    const password = generatePassword()
    const port = engine === 'mysql' ? 3306 : 5432

    // Sprawdź duplikat (per engine)
    const exists = await prisma.database.findFirst({ where: { name, engine } })
    if (exists) return reply.code(409).send({ success: false, error: 'Database name already exists' })

    try {
      if (engine === 'mysql') {
        await createMysqlDatabase(name, dbUser, password)
      } else {
        await createPgDatabase(name, dbUser, password)
      }
    } catch (err) {
      return reply.code(500).send({ success: false, error: 'Failed to create database on server' })
    }

    const db = await prisma.database.create({
      data: { name, engine, dbUser, port, userId: caller.id, siteId: siteId ?? null },
    })

    return reply.code(201).send({
      success: true,
      data: { ...db, password }, // hasło tylko przy tworzeniu
    })
  })

  // DELETE /api/databases/:id
  fastify.delete('/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)
    const db = await prisma.database.findUnique({ where: { id } })
    if (!db) return reply.code(404).send({ success: false, error: 'Not found' })
    if (caller.role !== 'admin' && db.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    if (db.engine === 'mysql') {
      await dropMysqlDatabase(db.name, db.dbUser)
    } else {
      await dropPgDatabase(db.name, db.dbUser)
    }

    await prisma.database.delete({ where: { id } })
    return reply.send({ success: true, data: null })
  })

  // POST /api/databases/:id/import — import SQL (MySQL only)
  fastify.post('/:id/import', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)
    const db = await prisma.database.findUnique({ where: { id } })
    if (!db) return reply.code(404).send({ success: false, error: 'Not found' })
    if (caller.role !== 'admin' && db.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }
    if (db.engine !== 'mysql') {
      return reply.code(400).send({ success: false, error: 'Import is only supported for MySQL databases' })
    }

    const bodySchema = z.object({ sql: z.string().min(1) })
    const body = bodySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'sql (base64) is required' })
    }

    let sqlBuffer: Buffer
    try {
      sqlBuffer = Buffer.from(body.data.sql, 'base64')
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid base64 content' })
    }

    const tempFile = `/tmp/overpanel-import-${id}-${Date.now()}.sql`
    try {
      await writeFile(tempFile, sqlBuffer)
      const rootPass = process.env.MYSQL_ROOT_PASSWORD ?? ''
      const passFlag = rootPass ? ` -p'${rootPass}'` : ''
      await run(`mysql -u root${passFlag} ${esc(db.name)} < ${tempFile}`)
    } finally {
      await unlink(tempFile).catch(() => {})
    }

    return reply.send({ success: true, data: { message: 'Import zakończony' } })
  })

  // POST /api/databases/:id/dump — eksport SQL
  fastify.post('/:id/dump', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)
    const db = await prisma.database.findUnique({ where: { id } })
    if (!db) return reply.code(404).send({ success: false, error: 'Not found' })
    if (caller.role !== 'admin' && db.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const dumpPath =
      db.engine === 'mysql'
        ? await dumpMysqlDatabase(db.name)
        : await dumpPgDatabase(db.name)

    return reply.send({ success: true, data: { path: dumpPath } })
  })
}

function generatePassword(length = 24): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}
