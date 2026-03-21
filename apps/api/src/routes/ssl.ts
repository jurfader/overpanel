import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { adminOnly } from '../middleware/auth.js'
import { run } from '../services/shell.js'

export async function sslRoutes(fastify: FastifyInstance) {
  // POST /api/ssl/setup-autorenewal — create a system cron job for certbot renewal
  fastify.post('/setup-autorenewal', { preHandler: [adminOnly] }, async (_req, reply) => {
    try {
      // Check if cron already exists
      const check = await run(
        'crontab -l 2>/dev/null | grep -q "certbot renew" && echo "exists" || echo "missing"',
      )
      if (check.stdout.trim() === 'exists') {
        return reply.send({ success: true, data: { message: 'Auto-renewal already configured' } })
      }
      // Add to crontab: run certbot renew twice daily + reload nginx
      await run(
        `(crontab -l 2>/dev/null; echo "0 0,12 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx' 2>/dev/null") | crontab -`,
      )
      return reply.send({ success: true, data: { message: 'Auto-renewal configured' } })
    } catch (err) {
      return reply.code(500).send({ success: false, error: String(err) })
    }
  })

  // GET /api/ssl/autorenewal-status — check if certbot cron is configured
  fastify.get('/autorenewal-status', { preHandler: [adminOnly] }, async (_req, reply) => {
    try {
      const check = await run('crontab -l 2>/dev/null | grep "certbot renew" || echo ""')
      const configured = check.stdout.trim().length > 0
      return reply.send({
        success: true,
        data: { configured, cronLine: check.stdout.trim() || null },
      })
    } catch {
      return reply.send({ success: true, data: { configured: false, cronLine: null } })
    }
  })

  // POST /api/ssl/custom — upload custom SSL cert + key for a domain
  const customCertSchema = z.object({
    domain: z.string().min(1),
    certificate: z.string().min(1), // PEM content
    privateKey: z.string().min(1),  // PEM content
  })

  fastify.post('/custom', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = customCertSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message })
    }

    const { domain, certificate, privateKey } = body.data

    // Validate PEM format
    if (!certificate.includes('BEGIN CERTIFICATE') || !privateKey.includes('BEGIN')) {
      return reply
        .code(400)
        .send({ success: false, error: 'Nieprawidłowy format certyfikatu PEM' })
    }

    try {
      const certPath = `/etc/letsencrypt/live/${domain}`
      await run(`mkdir -p ${JSON.stringify(certPath)}`)

      // Write cert and key files
      const { writeFileSync } = await import('fs')
      writeFileSync(`${certPath}/fullchain.pem`, certificate, { mode: 0o644 })
      writeFileSync(`${certPath}/privkey.pem`, privateKey, { mode: 0o600 })

      // Save to DB
      const now = new Date()
      const expiryDate = new Date(now)
      expiryDate.setFullYear(expiryDate.getFullYear() + 1) // assume 1 year validity

      const existing = await prisma.sslCertificate.findFirst({ where: { domain } })

      if (existing) {
        await prisma.sslCertificate.update({
          where: { id: existing.id },
          data: {
            type: 'custom',
            certPath: `${certPath}/fullchain.pem`,
            keyPath: `${certPath}/privkey.pem`,
            issuedAt: now,
            expiresAt: expiryDate,
            updatedAt: now,
          },
        })
      } else {
        await prisma.sslCertificate.create({
          data: {
            domain,
            type: 'custom',
            certPath: `${certPath}/fullchain.pem`,
            keyPath: `${certPath}/privkey.pem`,
            issuedAt: now,
            expiresAt: expiryDate,
          },
        })
      }

      // Reload nginx to apply the new certificate
      await run('systemctl reload nginx').catch(() => {})

      return reply.send({ success: true, data: { message: 'Certyfikat zainstalowany' } })
    } catch (err) {
      return reply.code(500).send({ success: false, error: String(err) })
    }
  })
}
