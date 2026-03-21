import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, getRequestUser } from '../middleware/auth.js'
import { createNginxVhost, createNginxNodeProxy, deleteNginxVhost, reloadNginx } from '../services/nginx.js'
import { issueSslCert } from '../services/ssl.js'
import { createSystemUser, deleteSystemUser } from '../services/system-user.js'
import { findZoneForDomain, createDnsRecord, getPublicIp } from '../services/cloudflare.js'
import { addDomainToTunnel, removeDomainFromTunnel, isTunnelActive } from '../services/cloudflared.js'

async function getUserCfToken(userId: string): Promise<string | null> {
  const token = await prisma.cloudflareToken.findFirst({
    where: { userId, isDefault: true },
    select: { token: true },
  })
  return token?.token ?? process.env.CLOUDFLARE_API_TOKEN ?? null
}

const createSiteSchema = z.object({
  domain: z.string().min(3).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Invalid domain'),
  siteType: z.enum(['php', 'nodejs', 'python', 'proxy', 'static', 'overcms']).default('php'),
  adminPassword: z.string().optional(),
  licenseKey: z.string().optional(),
  phpVersion: z.enum(['7.4', '8.0', '8.1', '8.2', '8.3']).default('8.3'),
  appPort: z.number().int().min(1024).max(65535).optional(),
  startCommand: z.string().max(200).optional(),
  enableSsl: z.boolean().default(true),
  userId: z.string().optional(), // admin może przypisać do klienta
})

export async function sitesRoutes(fastify: FastifyInstance) {
  // GET /api/sites
  fastify.get('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const where = caller.role === 'admin' ? {} : { userId: caller.id }

    const sites = await prisma.site.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { databases: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ success: true, data: sites })
  })

  // GET /api/sites/:id
  fastify.get('/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    const site = await prisma.site.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true } }, databases: true },
    })
    if (!site) return reply.code(404).send({ success: false, error: 'Site not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }
    return reply.send({ success: true, data: site })
  })

  // POST /api/sites — utwórz stronę
  fastify.post('/', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = createSiteSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }

    const { domain, siteType, phpVersion, appPort, startCommand, enableSsl, userId } = body.data

    // Klient może tworzyć tylko dla siebie
    const ownerId = caller.role === 'admin' && userId ? userId : caller.id

    // Sprawdź duplikat
    const exists = await prisma.site.findUnique({ where: { domain } })
    if (exists) return reply.code(409).send({ success: false, error: 'Domain already exists' })

    const documentRoot = `/var/www/${domain}/public`

    // Stwórz rekord w DB
    const site = await prisma.site.create({
      data: {
        domain,
        siteType: siteType ?? 'php',
        phpVersion,
        appPort: appPort ?? null,
        startCommand: startCommand ?? null,
        documentRoot,
        userId: ownerId,
        status: 'pending',
      },
    })

    // Operacje systemowe (async w tle, status update)
    setImmediate(async () => {
      try {
        // 1. Użytkownik systemowy (non-fatal — fallback do www-data)
        try {
          await createSystemUser(domain)
        } catch (userErr) {
          console.warn(`[Site] System user for ${domain} failed (non-fatal):`, userErr)
        }

        // 2. Nginx vhost — type-aware
        if (siteType === 'overcms') {
          // OverCMS gets its own nginx proxy after Docker containers are up (see step 2b)
        } else if (siteType === 'nodejs' || siteType === 'python' || siteType === 'proxy') {
          const port = appPort ?? 3000
          await createNginxNodeProxy({ domain, appPort: port })
        } else {
          // php, static — use standard PHP-FPM vhost (static ignores PHP blocks but that's harmless)
          await createNginxVhost({ domain, documentRoot, phpVersion })
        }
        if (siteType !== 'overcms') {
          await reloadNginx()
        }

        // 2b. OverCMS installation
        if (siteType === 'overcms') {
          try {
            const { installOverCms } = await import('../services/overcms.js')
            const { createNginxOverCmsProxy } = await import('../services/nginx.js')
            const result = await installOverCms({
              domain,
              adminEmail: caller.email || 'admin@' + domain,
              adminPassword: body.data.adminPassword || 'Admin123!',
              licenseKey: body.data.licenseKey,
              ghToken: process.env.GH_TOKEN,
            })
            await createNginxOverCmsProxy({ domain, apiPort: result.apiPort, adminPort: result.adminPort })
            await reloadNginx()
            console.log(`[OverCMS] Installed for ${domain}: API=${result.apiPort}, Admin=${result.adminPort}`)
          } catch (err: any) {
            console.error(`[OverCMS] Install failed for ${domain}:`, err.message)
          }
        }

        // 3. SSL + tunnel — strategia zależy od środowiska
        let hasSSL = false
        let sslExpiry: Date | undefined
        const cfToken = await getUserCfToken(ownerId)
        const tunnelActive = await isTunnelActive()

        if (tunnelActive) {
          // cloudflared aktywny → dodaj domenę do tunelu (Cloudflare Edge obsługuje HTTPS)
          try {
            await addDomainToTunnel(domain)
            console.log(`[Tunnel] Added ${domain} to cloudflared config`)
            hasSSL = true // CF Edge zapewnia HTTPS
            sslExpiry = new Date('2099-12-31') // praktycznie nigdy nie wygasa
          } catch (tunnelErr) {
            console.warn(`[Tunnel] Failed to add ${domain}:`, tunnelErr)
          }
        } else if (enableSsl) {
          // Brak tunelu — CF Origin Cert lub Let's Encrypt
          const result = await issueSslCert(domain, cfToken)
          hasSSL = result.success
          sslExpiry = result.expiry

          if (result.provider !== 'none') {
            console.log(`[SSL] ${domain}: ${result.provider} (${result.success ? 'OK' : 'FAIL'})`)
          }
        }

        // 4. Auto-dodaj rekord A w Cloudflare (jeśli token dostępny)
        if (cfToken) {
          try {
            const zone = await findZoneForDomain(cfToken, domain)
            if (zone) {
              const ip = await getPublicIp()
              await createDnsRecord(cfToken, zone.id, {
                type: 'A',
                name: domain,
                content: ip,
                ttl: 1,
                proxied: true, // pomarańcza domyślnie
              })
              console.log(`[DNS] Auto A record: ${domain} → ${ip} (proxied)`)
            }
          } catch (dnsErr) {
            console.warn(`[DNS] Auto A record failed for ${domain}:`, dnsErr)
          }
        }

        await prisma.site.update({
          where: { id: site.id },
          data: { status: 'active', hasSSL, sslExpiry },
        })

        await prisma.auditLog.create({
          data: { userId: ownerId, action: 'site.create', resource: 'site', resourceId: site.id },
        })
      } catch (err) {
        console.error(`Failed to provision site ${domain}:`, err)
        await prisma.site.update({ where: { id: site.id }, data: { status: 'inactive' } })
      }
    })

    return reply.code(201).send({ success: true, data: site })
  })

  // PATCH /api/sites/:id — edytuj (status, PHP version)
  fastify.patch('/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)
    const site = await prisma.site.findUnique({ where: { id } })
    if (!site) return reply.code(404).send({ success: false, error: 'Not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const schema = z.object({
      status: z.enum(['active', 'inactive']).optional(),
      phpVersion: z.enum(['7.4', '8.0', '8.1', '8.2', '8.3']).optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })

    const updated = await prisma.site.update({ where: { id }, data: body.data })
    if (body.data.phpVersion) {
      await createNginxVhost({ domain: site.domain, documentRoot: site.documentRoot, phpVersion: body.data.phpVersion })
      await reloadNginx()
    }
    return reply.send({ success: true, data: updated })
  })

  // DELETE /api/sites/:id
  fastify.delete('/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)
    const site = await prisma.site.findUnique({ where: { id } })
    if (!site) return reply.code(404).send({ success: false, error: 'Not found' })
    if (caller.role !== 'admin' && site.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    await prisma.site.delete({ where: { id } })

    setImmediate(async () => {
      try {
        await removeDomainFromTunnel(site.domain).catch(() => {}) // ignoruj błąd gdy tunnel nieaktywny
        await deleteNginxVhost(site.domain)
        await reloadNginx()
        await deleteSystemUser(site.domain)
      } catch (err) {
        console.error(`Cleanup failed for ${site.domain}:`, err)
      }
    })

    return reply.send({ success: true, data: null })
  })
}
