import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createReadStream } from 'fs'
import { prisma } from '@overpanel/db'
import { authMiddleware, adminOnly, getRequestUser } from '../middleware/auth.js'
import {
  backupSiteFiles,
  backupDatabase,
  createFullBackup,
  listBackupFiles,
  deleteBackupFile,
  getBackupFilePath,
  restoreSiteFiles,
  restoreDatabase,
} from '../services/backup.js'
import { uploadToProviders, testProvider } from '../services/backup-providers.js'
import type { BackupProvider } from '../services/backup-providers.js'

const createBackupSchema = z.object({
  siteId: z.string(),
  type: z.enum(['files', 'database', 'full']),
  databaseId: z.string().optional(),
})

export async function backupsRoutes(fastify: FastifyInstance) {
  // GET /api/backups — list backup files
  fastify.get('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const { siteId } = request.query as { siteId?: string }

    if (siteId) {
      // Fetch site, check ownership
      const site = await prisma.site.findUnique({ where: { id: siteId } })
      if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
      if (caller.role !== 'admin' && site.userId !== caller.id) {
        return reply.code(403).send({ success: false, error: 'Forbidden' })
      }
      const files = await listBackupFiles(site.domain)
      return reply.send({ success: true, data: { files } })
    }

    if (caller.role === 'admin') {
      // Admin sees all backups
      const files = await listBackupFiles()
      return reply.send({ success: true, data: { files } })
    }

    // Client: collect domains from their sites, then list and merge
    const userSites = await prisma.site.findMany({
      where: { userId: caller.id },
      select: { domain: true },
    })

    const allFiles = await Promise.all(
      userSites.map((s) => listBackupFiles(s.domain))
    )
    const files = allFiles.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return reply.send({ success: true, data: { files } })
  })

  // POST /api/backups — create a backup
  fastify.post('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = createBackupSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }

    const { siteId, type, databaseId } = body.data

    // Validate site ownership
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    // Fetch database if needed
    let db: { name: string; engine: string; dbUser: string } | null = null
    if ((type === 'database' || type === 'full') && databaseId) {
      db = await prisma.database.findUnique({
        where: { id: databaseId },
        select: { name: true, engine: true, dbUser: true },
      })
      if (!db) return reply.code(404).send({ success: false, error: 'Database not found' })
    }

    // Create DB record with status=running
    const backup = await prisma.backup.create({
      data: {
        type,
        status: 'running',
        userId: caller.id,
        siteId: site.id,
      },
    })

    // Run backup in background
    setImmediate(async () => {
      try {
        let sizeMb = 0
        let backupPath: string | undefined

        if (type === 'files') {
          backupPath = await backupSiteFiles(site.domain, site.documentRoot)
        } else if (type === 'database') {
          if (!db) throw new Error('No database selected')
          backupPath = await backupDatabase(
            db.name,
            db.engine as 'mysql' | 'postgresql',
            db.dbUser
          )
        } else {
          // full
          const result = await createFullBackup(
            site.domain,
            site.documentRoot,
            db?.name,
            db?.engine as 'mysql' | 'postgresql' | undefined,
            db?.dbUser
          )
          backupPath = result.filesPath ?? result.dbPath
        }

        // Get size from filesystem
        if (backupPath) {
          const { statSync } = await import('fs')
          try {
            const stat = statSync(backupPath)
            sizeMb = stat.size / (1024 * 1024)
          } catch {
            // ignore
          }
        }

        await prisma.backup.update({
          where: { id: backup.id },
          data: { status: 'success', sizeMb, path: backupPath ?? null },
        })

        // Upload to all configured backup providers (fire-and-forget)
        if (backupPath) {
          try {
            const results = await uploadToProviders(backupPath)
            for (const r of results) {
              if (r.success) {
                console.log(`[Backup] Uploaded to ${r.provider}: ${r.url ?? 'OK'}`)
              } else {
                console.error(`[Backup] ${r.provider} upload failed: ${r.error ?? 'unknown'}`)
              }
            }
          } catch (err) {
            console.error('[Backup] Provider upload failed:', err)
          }
        }
      } catch (err: any) {
        await prisma.backup.update({
          where: { id: backup.id },
          data: { status: 'failed', errorMsg: err?.message ?? 'Unknown error' },
        })
      }
    })

    return reply.code(202).send({ success: true, data: backup })
  })

  // GET /api/backups/s3-status — check if S3 is configured
  fastify.get('/s3-status', { preHandler: [adminOnly] }, async (_req, reply) => {
    const { isS3Configured } = await import('../services/s3.js')
    const configured = await isS3Configured()
    return reply.send({ success: true, data: { configured } })
  })

  // DELETE /api/backups/cleanup — delete backups older than N days
  fastify.delete('/cleanup', { preHandler: [adminOnly] }, async (request, reply) => {
    const { days = 30 } = request.query as { days?: number }
    const cutoff = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)

    const oldBackups = await prisma.backup.findMany({
      where: { createdAt: { lt: cutoff } },
    })

    const { unlinkSync, existsSync } = await import('fs')

    let deleted = 0
    for (const backup of oldBackups) {
      try {
        if (backup.path && existsSync(backup.path)) unlinkSync(backup.path)
        await prisma.backup.delete({ where: { id: backup.id } })
        deleted++
      } catch {
        // continue with next backup
      }
    }

    return reply.send({ success: true, data: { deleted, cutoffDate: cutoff } })
  })

  // DELETE /api/backups/:filename — delete backup file
  fastify.delete('/:filename', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { filename } = request.params as { filename: string }

    if (filename.includes('/') || filename.includes('..')) {
      return reply.code(400).send({ success: false, error: 'Invalid filename' })
    }

    try {
      await deleteBackupFile(filename)
    } catch (err: any) {
      return reply.code(404).send({ success: false, error: err?.message ?? 'File not found' })
    }

    return reply.send({ success: true, data: null })
  })

  // POST /api/backups/restore — restore files or database from backup
  fastify.post('/restore', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const schema = z.object({
      filename: z.string().min(1).max(200),
      siteId: z.string(),
      databaseId: z.string().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }

    const { filename, siteId, databaseId } = body.data

    if (filename.includes('/') || filename.includes('..')) {
      return reply.code(400).send({ success: false, error: 'Invalid filename' })
    }

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    // Detect restore type from filename
    const isFilesBackup = filename.includes('_files_')
    const isDbBackup = filename.includes('_db_')

    if (!isFilesBackup && !isDbBackup) {
      return reply.code(400).send({ success: false, error: 'Cannot determine backup type from filename' })
    }

    setImmediate(async () => {
      try {
        if (isFilesBackup) {
          await restoreSiteFiles(filename, site.documentRoot)
          console.log(`[Backup] Restored files for ${site.domain} from ${filename}`)
        } else if (isDbBackup && databaseId) {
          const db = await prisma.database.findUnique({
            where: { id: databaseId },
            select: { name: true, engine: true, dbUser: true },
          })
          if (db) {
            await restoreDatabase(filename, db.name, db.engine as 'mysql' | 'postgresql', db.dbUser)
            console.log(`[Backup] Restored database ${db.name} from ${filename}`)
          }
        }
      } catch (err) {
        console.error('[Backup] Restore error:', err)
      }
    })

    return reply.code(202).send({ success: true, data: { message: 'Restore started' } })
  })

  // GET /api/backups/download/:filename — stream backup file
  fastify.get('/download/:filename', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { filename } = request.params as { filename: string }

    let filePath: string
    try {
      filePath = await getBackupFilePath(filename)
    } catch (err: any) {
      return reply.code(404).send({ success: false, error: err?.message ?? 'File not found' })
    }

    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.header('Content-Type', 'application/octet-stream')

    const stream = createReadStream(filePath)
    return reply.send(stream)
  })

  // ── Backup provider & schedule endpoints ─────────────────────────────────

  // POST /api/backups/test-provider — test a backup provider connection
  fastify.post('/test-provider', { preHandler: [adminOnly] }, async (request, reply) => {
    const schema = z.object({
      provider: z.enum(['s3', 'sftp', 'gdrive', 'dropbox', 'local']),
      config: z.record(z.any()).optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }

    const { provider, config: providerConfig } = body.data
    const result = await testProvider(provider as BackupProvider, providerConfig ?? {})
    return reply.send({ success: result.success, data: result })
  })

  // GET /api/backups/schedule — get current schedule settings
  fastify.get('/schedule', { preHandler: [adminOnly] }, async (_request, reply) => {
    const keys = ['backup_schedule', 'backup_time', 'backup_retention']
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))

    return reply.send({
      success: true,
      data: {
        schedule: settings.backup_schedule || 'disabled',
        time: settings.backup_time || '03:00',
        retention: parseInt(settings.backup_retention || '10', 10),
      },
    })
  })

  // POST /api/backups/schedule — update schedule settings
  fastify.post('/schedule', { preHandler: [adminOnly] }, async (request, reply) => {
    const schema = z.object({
      schedule: z.enum(['daily', 'weekly', 'monthly', 'disabled']).optional(),
      time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format').optional(),
      retention: z.number().int().min(1).max(1000).optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }

    const { schedule, time, retention } = body.data
    const upsert = async (key: string, value: string) => {
      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }

    if (schedule !== undefined) await upsert('backup_schedule', schedule)
    if (time !== undefined) await upsert('backup_time', time)
    if (retention !== undefined) await upsert('backup_retention', String(retention))

    // Return updated values
    const keys = ['backup_schedule', 'backup_time', 'backup_retention']
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))

    return reply.send({
      success: true,
      data: {
        schedule: settings.backup_schedule || 'disabled',
        time: settings.backup_time || '03:00',
        retention: parseInt(settings.backup_retention || '10', 10),
      },
    })
  })

  // ── NAS Backup Endpoints ──────────────────────────────────────────────────

  // GET /api/backups/nas/status — NAS disk info + configured status
  fastify.get('/nas/status', { preHandler: [adminOnly] }, async (_req, reply) => {
    const { isNasConfigured, getNasDiskInfo } = await import('../services/nas.js')
    if (!(await isNasConfigured())) {
      return reply.send({ success: true, data: { configured: false } })
    }
    const disk = await getNasDiskInfo()
    return reply.send({ success: true, data: { configured: true, disk } })
  })

  // GET /api/backups/nas/list — list all NAS backups
  fastify.get('/nas/list', { preHandler: [adminOnly] }, async (_req, reply) => {
    const { isNasConfigured, listNasBackups } = await import('../services/nas.js')
    if (!(await isNasConfigured())) {
      return reply.send({ success: true, data: [] })
    }
    const backups = await listNasBackups()
    return reply.send({ success: true, data: backups })
  })

  // POST /api/backups/nas/restore — restore from NAS daily backup
  fastify.post('/nas/restore', { preHandler: [adminOnly] }, async (request, reply) => {
    const schema = z.object({ filename: z.string().min(1) })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    if (body.data.filename.includes('/') || body.data.filename.includes('..')) {
      return reply.code(400).send({ success: false, error: 'Invalid filename' })
    }

    const { restoreFromNasBackup } = await import('../services/nas.js')
    try {
      const log = await restoreFromNasBackup(body.data.filename)
      return reply.send({ success: true, data: { log } })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // DELETE /api/backups/nas/:filename — delete NAS backup
  fastify.delete('/nas/:filename', { preHandler: [adminOnly] }, async (request, reply) => {
    const { filename } = request.params as { filename: string }
    const { type } = request.query as { type?: string }
    if (filename.includes('/') || filename.includes('..')) {
      return reply.code(400).send({ success: false, error: 'Invalid filename' })
    }
    const { deleteNasBackup } = await import('../services/nas.js')
    try {
      await deleteNasBackup(filename, type === 'system-image' ? 'system-image' : 'daily')
      return reply.send({ success: true, data: null })
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message })
    }
  })

  // POST /api/backups/nas/trigger — trigger backup now
  fastify.post('/nas/trigger', { preHandler: [adminOnly] }, async (request, reply) => {
    const { type } = request.body as { type?: string }
    const { triggerDailyBackup, triggerSystemImageBackup } = await import('../services/nas.js')

    reply.code(202).send({ success: true, data: { message: 'Backup uruchomiony' } })

    setImmediate(async () => {
      try {
        if (type === 'system-image') {
          await triggerSystemImageBackup()
        } else {
          await triggerDailyBackup()
        }
        console.log(`[NAS] ${type === 'system-image' ? 'System image' : 'Daily'} backup completed`)
      } catch (err: any) {
        console.error(`[NAS] Backup failed:`, err.message)
      }
    })
  })
}
