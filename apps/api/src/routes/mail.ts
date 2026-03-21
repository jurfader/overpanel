import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, adminOnly, getRequestUser } from '../middleware/auth.js'
import {
  isStalwartRunning,
  createStalwartDomain,
  deleteStalwartDomain,
  createStalwartAccount,
  updateStalwartPassword,
  deleteStalwartAccount,
  getStalwartDkimPublicKey,
} from '../services/stalwart.js'
import {
  configureMailDns,
  removeMailDns,
  checkMailDnsStatus,
} from '../services/mail-dns.js'
import { getPublicIp } from '../services/cloudflare.js'

// ── Zod schemas ──────────────────────────────────────────────────────────────

const createDomainSchema = z.object({
  domain: z
    .string()
    .min(3, 'Domain must be at least 3 characters')
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Invalid domain format'),
  siteId: z.string().optional(),
})

const createMailboxSchema = z.object({
  domainId: z.string().min(1, 'domainId is required'),
  localPart: z
    .string()
    .min(1, 'localPart is required')
    .regex(/^[a-z0-9._-]+$/, 'localPart must contain only lowercase letters, numbers, dots, dashes, underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().optional(),
  quotaMb: z.number().int().min(10).max(50000).optional(),
})

const updateMailboxSchema = z.object({
  displayName: z.string().optional(),
  quotaMb: z.number().int().min(10).max(50000).optional(),
  isActive: z.boolean().optional(),
})

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

// ── Helper ───────────────────────────────────────────────────────────────────

async function getCfToken(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: 'cf_global_token' } })
  if (!row?.value) {
    throw new Error('Cloudflare token not configured (cf_global_token)')
  }
  return row.value
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function mailRoutes(fastify: FastifyInstance) {

  // GET /api/mail/status — check if Stalwart is running
  fastify.get('/status', { preHandler: [authMiddleware] }, async (_request, reply) => {
    const running = await isStalwartRunning()
    return reply.send({ success: true, data: { running } })
  })

  // ── Domains ────────────────────────────────────────────────────────────────

  // GET /api/mail/domains — list mail domains
  fastify.get('/domains', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const where = caller.role === 'admin' ? {} : { userId: caller.id }

    const domains = await prisma.mailDomain.findMany({
      where,
      include: {
        site: { select: { id: true, domain: true } },
        _count: { select: { mailboxes: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({ success: true, data: domains })
  })

  // POST /api/mail/domains — enable mail for a domain (admin only)
  fastify.post('/domains', { preHandler: [adminOnly] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = createDomainSchema.safeParse(request.body)

    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const { domain, siteId } = body.data

    // Check for duplicate
    const existing = await prisma.mailDomain.findUnique({ where: { domain } })
    if (existing) {
      return reply.code(409).send({ success: false, error: 'Mail domain already exists' })
    }

    // Validate site ownership if provided
    if (siteId) {
      const site = await prisma.site.findUnique({ where: { id: siteId } })
      if (!site) {
        return reply.code(404).send({ success: false, error: 'Site not found' })
      }
    }

    // Create domain in Stalwart
    try {
      await createStalwartDomain(domain)
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to create domain in Stalwart',
      })
    }

    // Get DKIM public key from Stalwart
    const dkimPublicKey = await getStalwartDkimPublicKey(domain)

    // Configure DNS records via Cloudflare
    let dnsStatus = { mx: false, spf: false, dkim: false, dmarc: false }
    try {
      const cfToken = await getCfToken()
      const serverIp = await getPublicIp()
      dnsStatus = await configureMailDns(domain, serverIp, dkimPublicKey ?? '', cfToken)
    } catch (err: any) {
      console.error(`[Mail] DNS configuration failed for ${domain}:`, err.message)
    }

    // Store in database
    const mailDomain = await prisma.mailDomain.create({
      data: {
        domain,
        dkimPublicKey,
        mxConfigured: dnsStatus.mx,
        spfConfigured: dnsStatus.spf,
        dkimConfigured: dnsStatus.dkim,
        dmarcConfigured: dnsStatus.dmarc,
        userId: caller.id,
        siteId: siteId ?? null,
      },
      include: {
        site: { select: { id: true, domain: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'mail.domain.create',
        resource: 'mail_domain',
        resourceId: mailDomain.id,
        meta: JSON.stringify({ domain }),
      },
    })

    return reply.code(201).send({ success: true, data: mailDomain })
  })

  // DELETE /api/mail/domains/:id — disable mail for a domain (admin only)
  fastify.delete('/domains/:id', { preHandler: [adminOnly] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    const mailDomain = await prisma.mailDomain.findUnique({
      where: { id },
      include: { mailboxes: true },
    })
    if (!mailDomain) {
      return reply.code(404).send({ success: false, error: 'Mail domain not found' })
    }

    // Delete all mailbox accounts in Stalwart
    for (const mailbox of mailDomain.mailboxes) {
      await deleteStalwartAccount(mailbox.address).catch((err) => {
        console.error(`[Mail] Failed to delete Stalwart account ${mailbox.address}:`, err.message)
      })
    }

    // Delete domain in Stalwart
    await deleteStalwartDomain(mailDomain.domain).catch((err) => {
      console.error(`[Mail] Failed to delete Stalwart domain ${mailDomain.domain}:`, err.message)
    })

    // Remove DNS records
    try {
      const cfToken = await getCfToken()
      await removeMailDns(mailDomain.domain, cfToken)
    } catch (err: any) {
      console.error(`[Mail] DNS cleanup failed for ${mailDomain.domain}:`, err.message)
    }

    // Delete from database (cascades to mailboxes)
    await prisma.mailDomain.delete({ where: { id } })

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'mail.domain.delete',
        resource: 'mail_domain',
        resourceId: id,
        meta: JSON.stringify({ domain: mailDomain.domain }),
      },
    })

    return reply.send({ success: true, data: null })
  })

  // GET /api/mail/domains/:id/dns — check DNS status for a mail domain
  fastify.get('/domains/:id/dns', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    const mailDomain = await prisma.mailDomain.findUnique({ where: { id } })
    if (!mailDomain) {
      return reply.code(404).send({ success: false, error: 'Mail domain not found' })
    }

    if (caller.role !== 'admin' && mailDomain.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    try {
      const cfToken = await getCfToken()
      const status = await checkMailDnsStatus(mailDomain.domain, cfToken)

      // Update stored status
      await prisma.mailDomain.update({
        where: { id },
        data: {
          mxConfigured: status.mx,
          spfConfigured: status.spf,
          dkimConfigured: status.dkim,
          dmarcConfigured: status.dmarc,
        },
      })

      return reply.send({ success: true, data: status })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to check DNS status',
      })
    }
  })

  // ── Mailboxes ──────────────────────────────────────────────────────────────

  // GET /api/mail/mailboxes — list mailboxes
  fastify.get('/mailboxes', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const where = caller.role === 'admin' ? {} : { userId: caller.id }

    const mailboxes = await prisma.mailbox.findMany({
      where,
      include: {
        domain: { select: { id: true, domain: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({ success: true, data: mailboxes })
  })

  // POST /api/mail/mailboxes — create a mailbox
  fastify.post('/mailboxes', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = createMailboxSchema.safeParse(request.body)

    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const { domainId, localPart, password, displayName, quotaMb } = body.data

    // Validate domain ownership
    const mailDomain = await prisma.mailDomain.findUnique({ where: { id: domainId } })
    if (!mailDomain) {
      return reply.code(404).send({ success: false, error: 'Mail domain not found' })
    }
    if (caller.role !== 'admin' && mailDomain.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const address = `${localPart}@${mailDomain.domain}`

    // Check for duplicate
    const existing = await prisma.mailbox.findUnique({ where: { address } })
    if (existing) {
      return reply.code(409).send({ success: false, error: 'Mailbox address already exists' })
    }

    const resolvedQuota = quotaMb ?? 500
    const resolvedName = displayName ?? localPart

    // Create account in Stalwart
    try {
      await createStalwartAccount(address, password, resolvedName, resolvedQuota)
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to create mailbox in Stalwart',
      })
    }

    // Store in database
    const mailbox = await prisma.mailbox.create({
      data: {
        address,
        localPart,
        displayName: resolvedName,
        quotaMb: resolvedQuota,
        domainId,
        userId: caller.id,
      },
      include: {
        domain: { select: { id: true, domain: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'mail.mailbox.create',
        resource: 'mailbox',
        resourceId: mailbox.id,
        meta: JSON.stringify({ address }),
      },
    })

    return reply.code(201).send({ success: true, data: mailbox })
  })

  // PATCH /api/mail/mailboxes/:id — update mailbox (display name, quota, active)
  fastify.patch('/mailboxes/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    const mailbox = await prisma.mailbox.findUnique({ where: { id } })
    if (!mailbox) {
      return reply.code(404).send({ success: false, error: 'Mailbox not found' })
    }
    if (caller.role !== 'admin' && mailbox.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const body = updateMailboxSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const updates: Record<string, any> = {}
    if (body.data.displayName !== undefined) updates.displayName = body.data.displayName
    if (body.data.quotaMb !== undefined) updates.quotaMb = body.data.quotaMb
    if (body.data.isActive !== undefined) updates.isActive = body.data.isActive

    const updated = await prisma.mailbox.update({
      where: { id },
      data: updates,
      include: {
        domain: { select: { id: true, domain: true } },
      },
    })

    return reply.send({ success: true, data: updated })
  })

  // POST /api/mail/mailboxes/:id/password — reset mailbox password
  fastify.post('/mailboxes/:id/password', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    const mailbox = await prisma.mailbox.findUnique({ where: { id } })
    if (!mailbox) {
      return reply.code(404).send({ success: false, error: 'Mailbox not found' })
    }
    if (caller.role !== 'admin' && mailbox.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const body = resetPasswordSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    try {
      await updateStalwartPassword(mailbox.address, body.data.password)
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to reset mailbox password',
      })
    }

    return reply.send({ success: true, data: null })
  })

  // DELETE /api/mail/mailboxes/:id — delete mailbox
  fastify.delete('/mailboxes/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const caller = getRequestUser(request)

    const mailbox = await prisma.mailbox.findUnique({ where: { id } })
    if (!mailbox) {
      return reply.code(404).send({ success: false, error: 'Mailbox not found' })
    }
    if (caller.role !== 'admin' && mailbox.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    // Delete from Stalwart
    try {
      await deleteStalwartAccount(mailbox.address)
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to delete mailbox from Stalwart',
      })
    }

    await prisma.mailbox.delete({ where: { id } })

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'mail.mailbox.delete',
        resource: 'mailbox',
        resourceId: id,
        meta: JSON.stringify({ address: mailbox.address }),
      },
    })

    return reply.send({ success: true, data: null })
  })

  // ── Connection info ────────────────────────────────────────────────────────

  // GET /api/mail/connection-info/:domainId — IMAP/SMTP connection settings
  fastify.get('/connection-info/:domainId', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { domainId } = request.params as { domainId: string }
    const caller = getRequestUser(request)

    const mailDomain = await prisma.mailDomain.findUnique({ where: { id: domainId } })
    if (!mailDomain) {
      return reply.code(404).send({ success: false, error: 'Mail domain not found' })
    }
    if (caller.role !== 'admin' && mailDomain.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    // Get Roundcube URL if configured
    const roundcubeRow = await prisma.setting.findUnique({ where: { key: 'mail_roundcube_url' } })

    const data = {
      domain: mailDomain.domain,
      imap: {
        host: `mail.${mailDomain.domain}`,
        port: 993,
        security: 'SSL/TLS',
      },
      smtp: {
        host: `mail.${mailDomain.domain}`,
        port: 465,
        security: 'SSL/TLS',
      },
      webmail: roundcubeRow?.value ?? null,
    }

    return reply.send({ success: true, data })
  })
}
