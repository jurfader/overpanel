import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, adminOnly, getRequestUser } from '../middleware/auth.js'
import {
  installWordPress,
  updateWordPress,
  uninstallWordPress,
  isWpCliAvailable,
} from '../services/wordpress.js'
import { createMysqlDatabase } from '../services/mysql.js'
import { createPgDatabase } from '../services/postgresql.js'
import { backupSiteFiles } from '../services/backup.js'

const installSchema = z.object({
  siteId: z.string(),
  // Istniejąca baza lub auto-tworzenie
  databaseId: z.string().optional(),
  dbAutoCreate: z.boolean().optional(),
  dbEngine: z.enum(['mysql', 'postgresql']).optional(),
  dbName: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, 'Tylko a-z, 0-9, _').optional(),
  siteTitle: z.string().min(1).max(200),
  adminUser: z.string().min(1).max(60).regex(/^[a-zA-Z0-9._-]+$/, 'Tylko litery, cyfry, . _ -'),
  adminPassword: z.string().min(8),
  adminEmail: z.string().email(),
  locale: z.enum(['pl_PL', 'en_US', 'de_DE', 'fr_FR', 'es_ES']).default('en_US'),
  starterTheme: z.string().optional(),
})

const installThemeSchema = z.object({
  theme: z.string().min(1).max(100),
  activate: z.boolean().default(true),
})

export async function wordpressRoutes(fastify: FastifyInstance) {
  // GET /api/wordpress/status — sprawdź czy WP-CLI jest dostępne
  fastify.get('/status', { preHandler: [authMiddleware] }, async (_request, reply) => {
    const available = await isWpCliAvailable()
    return reply.send({ success: true, data: { wpcli: available } })
  })

  // GET /api/wordpress — lista instalacji WordPress
  fastify.get('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const where = caller.role === 'admin' ? { hasWordpress: true } : { hasWordpress: true, userId: caller.id }

    const sites = await prisma.site.findMany({
      where,
      select: {
        id: true,
        domain: true,
        documentRoot: true,
        status: true,
        hasWordpress: true,
        wpVersion: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({ success: true, data: sites })
  })

  // POST /api/wordpress/install
  fastify.post('/install', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = installSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }

    const { siteId, databaseId, dbAutoCreate, dbEngine, dbName, siteTitle, adminUser, adminPassword, adminEmail, locale, starterTheme } = body.data

    // Pobierz stronę
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Strona nie istnieje' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Brak dostępu' })
    }
    if (site.hasWordpress) {
      return reply.code(409).send({ success: false, error: 'WordPress już zainstalowany na tej stronie' })
    }

    // Pobierz lub zaplanuj auto-create bazy
    let db: { id?: string; name: string; engine: string; dbUser: string; host: string; port: number } | null = null

    if (databaseId) {
      const found = await prisma.database.findUnique({ where: { id: databaseId } })
      if (!found) return reply.code(404).send({ success: false, error: 'Baza danych nie istnieje' })
      if (caller.role !== 'admin' && found.userId !== caller.id) {
        return reply.code(403).send({ success: false, error: 'Brak dostępu do bazy danych' })
      }
      db = found
    } else if (dbAutoCreate) {
      if (!dbName || !dbEngine) {
        return reply.code(400).send({ success: false, error: 'dbName i dbEngine wymagane przy dbAutoCreate' })
      }
      // Zapamiętaj parametry — baza zostanie stworzona w tle razem z WP
      db = {
        name: dbName,
        engine: dbEngine,
        dbUser: dbName.slice(0, 32),
        host: 'localhost',
        port: dbEngine === 'mysql' ? 3306 : 5432,
      }
    } else {
      return reply.code(400).send({ success: false, error: 'Podaj databaseId lub dbAutoCreate=true' })
    }

    // Instalacja w tle
    setImmediate(async () => {
      try {
        let resolvedDb = db!
        let dbPassword = `${db!.dbUser}_wp_${Math.random().toString(36).slice(2, 10)}`

        // Auto-tworzenie bazy
        if (dbAutoCreate && !databaseId) {
          if (db!.engine === 'mysql') {
            await createMysqlDatabase(db!.name, db!.dbUser, dbPassword)
          } else {
            await createPgDatabase(db!.name, db!.dbUser, dbPassword)
          }
          // Zapisz w Prisma
          const created = await prisma.database.create({
            data: {
              name: db!.name,
              engine: db!.engine,
              dbUser: db!.dbUser,
              host: db!.host,
              port: db!.port,
              userId: caller.id,
              siteId: site.id,
            },
          })
          resolvedDb = { ...created }
        } else {
          // Dla istniejącej bazy użyj nazwy użytkownika jako fallback hasła
          dbPassword = process.env[`DB_PASS_${db!.id}`] ?? db!.dbUser
        }

        const result = await installWordPress({
          domain: site.domain,
          documentRoot: site.documentRoot,
          dbEngine: resolvedDb.engine as 'mysql' | 'postgresql',
          dbName: resolvedDb.name,
          dbUser: resolvedDb.dbUser,
          dbPassword,
          dbHost: resolvedDb.host,
          dbPort: resolvedDb.port,
          siteTitle,
          adminUser,
          adminPassword,
          adminEmail,
          locale,
        })

        if (result.success) {
          // Install starter theme if specified
          if (starterTheme && starterTheme !== 'none') {
            try {
              const { run } = await import('../services/shell.js')
              const documentRoot = site.documentRoot ?? `/var/www/${site.domain}/public`
              await run(`wp theme install ${JSON.stringify(starterTheme)} --activate --path=${JSON.stringify(documentRoot)} --allow-root`)
            } catch (err) {
              console.warn('[WP] Theme install failed:', err)
              // non-fatal
            }
          }

          await prisma.site.update({
            where: { id: site.id },
            data: { hasWordpress: true, wpVersion: result.version },
          })
          await prisma.database.update({
            where: { id: db.id },
            data: { siteId: site.id },
          })
          await prisma.auditLog.create({
            data: {
              userId: caller.id,
              action: 'wordpress.install',
              resource: 'site',
              resourceId: site.id,
              meta: JSON.stringify({ domain: site.domain, version: result.version }),
            },
          })
          console.log(`[WordPress] Installed on ${site.domain} (${result.version})`)
        } else {
          console.error(`[WordPress] Install failed on ${site.domain}: ${result.error}`)
        }
      } catch (err) {
        console.error('[WordPress] Unexpected error during install:', err)
      }
    })

    return reply.code(202).send({ success: true, data: { message: 'Instalacja w toku...' } })
  })

  // POST /api/wordpress/:siteId/update
  fastify.post('/:siteId/update', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const caller = getRequestUser(request)

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }
    if (!site.hasWordpress) {
      return reply.code(400).send({ success: false, error: 'WordPress nie jest zainstalowany' })
    }

    setImmediate(async () => {
      // Auto-backup before update
      try {
        await backupSiteFiles(site.domain, site.documentRoot)
        console.log(`[WP] Auto-backup created for ${site.domain} before update`)
      } catch (backupErr) {
        console.warn(`[WP] Auto-backup failed (continuing with update):`, backupErr)
      }

      const result = await updateWordPress(site.documentRoot)
      if (result.success) {
        await prisma.site.update({
          where: { id: site.id },
          data: { wpVersion: result.version },
        })
        console.log(`[WordPress] Updated ${site.domain} to ${result.version}`)
      }
    })

    return reply.code(202).send({ success: true, data: { message: 'Aktualizacja w toku...' } })
  })

  // DELETE /api/wordpress/:siteId — usuń WordPress (bez usuwania bazy)
  fastify.delete('/:siteId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const caller = getRequestUser(request)

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    await prisma.site.update({
      where: { id: site.id },
      data: { hasWordpress: false, wpVersion: null },
    })

    setImmediate(async () => {
      await uninstallWordPress(site.documentRoot).catch((err) => {
        console.error(`[WordPress] Uninstall error on ${site.domain}:`, err)
      })
    })

    return reply.send({ success: true, data: null })
  })

  // POST /api/wordpress/:siteId/install-theme
  fastify.post('/:siteId/install-theme', { preHandler: [adminOnly] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const body = installThemeSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.errors[0]?.message })

    const { theme, activate } = body.data
    if (theme === 'none') return reply.send({ success: true, data: null })

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Strona nie znaleziona' })
    if (!site.hasWordpress) return reply.code(400).send({ success: false, error: 'Brak instalacji WordPress' })

    const wpPath = site.documentRoot ?? `/var/www/${site.domain}/public`
    const activateFlag = activate ? ' --activate' : ''

    try {
      const { run } = await import('../services/shell.js')
      await run(`wp theme install ${JSON.stringify(theme)}${activateFlag} --path=${JSON.stringify(wpPath)} --allow-root`)
      return reply.send({ success: true, data: { theme, activated: activate } })
    } catch (err) {
      return reply.code(500).send({ success: false, error: String(err) })
    }
  })
}
