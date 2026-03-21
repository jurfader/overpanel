import type { FastifyInstance } from 'fastify'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { authMiddleware, adminOnly, getRequestUser } from '../middleware/auth.js'
import { run } from '../services/shell.js'
import { prisma } from '@overpanel/db'
import { z } from 'zod'

export async function phpRoutes(fastify: FastifyInstance) {
  // GET /api/php/versions — detect installed PHP versions
  fastify.get('/versions', { preHandler: [authMiddleware] }, async (_req, reply) => {
    try {
      // List installed PHP versions from /etc/php/
      const lsOutput = await run('ls /etc/php/ 2>/dev/null || echo ""').catch(() => ({ stdout: '' }))
      const versions = lsOutput.stdout
        .trim()
        .split('\n')
        .filter(v => /^\d+\.\d+$/.test(v.trim()))
        .map(v => v.trim())

      const result = await Promise.all(
        versions.map(async (version) => {
          try {
            const status = await run(`systemctl is-active php${version}-fpm 2>/dev/null || echo "inactive"`)
            return { version, active: status.stdout.trim() === 'active' }
          } catch {
            return { version, active: false }
          }
        }),
      )

      return reply.send({ success: true, data: result })
    } catch {
      // Fallback: return common versions
      return reply.send({
        success: true,
        data: [
          { version: '8.1', active: false },
          { version: '8.2', active: false },
          { version: '8.3', active: false },
        ],
      })
    }
  })

  // GET /api/php/site/:siteId — get PHP settings for a site
  fastify.get('/site/:siteId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const caller = getRequestUser(request)

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Strona nie znaleziona' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Brak dostępu' })
    }

    const phpVersion = site.phpVersion || '8.3'
    const poolFile = `/etc/php/${phpVersion}/fpm/pool.d/${site.domain}.conf`

    // Default settings
    const defaults = {
      phpVersion,
      memoryLimit: '256M',
      uploadMaxFilesize: '64M',
      postMaxSize: '64M',
      maxExecutionTime: 60,
      maxInputTime: 60,
    }

    if (!existsSync(poolFile)) {
      return reply.send({ success: true, data: defaults })
    }

    try {
      const content = readFileSync(poolFile, 'utf8')
      const parse = (key: string, def: string) => {
        const m = content.match(new RegExp(`php_admin_value\\[${key}\\]\\s*=\\s*(.+)`))
        return m ? m[1].trim() : def
      }
      const parseNum = (key: string, def: number) => {
        const m = content.match(new RegExp(`php_admin_value\\[${key}\\]\\s*=\\s*(\\d+)`))
        return m ? parseInt(m[1]) : def
      }
      return reply.send({ success: true, data: {
        phpVersion,
        memoryLimit: parse('memory_limit', defaults.memoryLimit),
        uploadMaxFilesize: parse('upload_max_filesize', defaults.uploadMaxFilesize),
        postMaxSize: parse('post_max_size', defaults.postMaxSize),
        maxExecutionTime: parseNum('max_execution_time', defaults.maxExecutionTime),
        maxInputTime: parseNum('max_input_time', defaults.maxInputTime),
      }})
    } catch {
      return reply.send({ success: true, data: defaults })
    }
  })

  // PUT /api/php/site/:siteId — update PHP settings for a site
  const phpSettingsSchema = z.object({
    phpVersion: z.string().regex(/^\d+\.\d+$/).optional(),
    memoryLimit: z.string().regex(/^\d+[KMG]$/).optional(),
    uploadMaxFilesize: z.string().regex(/^\d+[KMG]$/).optional(),
    postMaxSize: z.string().regex(/^\d+[KMG]$/).optional(),
    maxExecutionTime: z.number().int().min(1).max(600).optional(),
    maxInputTime: z.number().int().min(1).max(600).optional(),
  })

  fastify.put('/site/:siteId', { preHandler: [adminOnly] }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string }
    const body = phpSettingsSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.errors[0]?.message })

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) return reply.code(404).send({ success: false, error: 'Strona nie znaleziona' })

    const phpVersion = body.data.phpVersion || site.phpVersion || '8.3'
    const domain = site.domain

    // Update phpVersion in DB if changed
    if (body.data.phpVersion && body.data.phpVersion !== site.phpVersion) {
      await prisma.site.update({ where: { id: siteId }, data: { phpVersion: body.data.phpVersion } })
    }

    const poolDir = `/etc/php/${phpVersion}/fpm/pool.d`

    // Build pool config
    const settings = body.data
    const poolContent = `[${domain}]
user = www-data
group = www-data
listen = /run/php/php${phpVersion}-fpm-${domain}.sock
listen.owner = www-data
listen.group = www-data
pm = dynamic
pm.max_children = 5
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
${settings.memoryLimit ? `php_admin_value[memory_limit] = ${settings.memoryLimit}` : ''}
${settings.uploadMaxFilesize ? `php_admin_value[upload_max_filesize] = ${settings.uploadMaxFilesize}` : ''}
${settings.postMaxSize ? `php_admin_value[post_max_size] = ${settings.postMaxSize}` : ''}
${settings.maxExecutionTime ? `php_admin_value[max_execution_time] = ${settings.maxExecutionTime}` : ''}
${settings.maxInputTime ? `php_admin_value[max_input_time] = ${settings.maxInputTime}` : ''}
`

    try {
      mkdirSync(poolDir, { recursive: true })
      writeFileSync(`${poolDir}/${domain}.conf`, poolContent)

      // Reload PHP-FPM
      await run(`systemctl reload php${phpVersion}-fpm`).catch(() => {})

      return reply.send({ success: true, data: { message: 'Ustawienia PHP zaktualizowane' } })
    } catch (err) {
      return reply.code(500).send({ success: false, error: String(err) })
    }
  })
}
