import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, adminOnly, getRequestUser } from '../middleware/auth.js'
import {
  isDockerAvailable,
  getDockerVersion,
  listContainers,
  getContainerLogs,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  pullImage,
  createAndStartContainer,
  findAvailablePort,
} from '../services/docker.js'
import { DOCKER_TEMPLATES, getTemplate, generateSecret } from '../services/docker-templates.js'
import { createDockerProxyVhost, deleteNginxVhost, reloadNginx } from '../services/nginx.js'
import { isTunnelActive, addDomainToTunnel } from '../services/cloudflared.js'

const deploySchema = z.object({
  displayName: z.string().min(1).max(100),
  name: z.string().min(2).max(50).regex(/^[a-z0-9][a-z0-9_-]*$/, 'Tylko małe litery, cyfry, _ i -'),
  templateId: z.string().min(1),
  image: z.string().min(1),         // może być nadpisany przez template
  internalPort: z.number().int().min(1).max(65535),
  externalPort: z.number().int().min(1).max(65535).optional(), // auto-assign if missing
  domain: z.string().min(1).optional(),
  envVars: z.record(z.string()).default({}),
  cpuLimit: z.number().min(0.1).max(16).optional(),
  memoryLimit: z.string().regex(/^\d+[kmgKMG]$/).optional(),
})

export async function dockerRoutes(fastify: FastifyInstance) {

  // GET /api/docker/status
  fastify.get('/status', { preHandler: [adminOnly] }, async (_req, reply) => {
    const available = await isDockerAvailable()
    const version = available ? await getDockerVersion().catch(() => 'unknown') : null
    return reply.send({ success: true, data: { available, version } })
  })

  // GET /api/docker/templates
  fastify.get('/templates', { preHandler: [adminOnly] }, async (_req, reply) => {
    return reply.send({ success: true, data: DOCKER_TEMPLATES })
  })

  // GET /api/docker — list all containers (db + live status)
  fastify.get('/', { preHandler: [adminOnly] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const where = caller.role === 'admin' ? {} : { userId: caller.id }

    const dbContainers = await prisma.dockerContainer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    // Enrich with live Docker status
    let liveContainers: Awaited<ReturnType<typeof listContainers>> = []
    try {
      liveContainers = await listContainers(true)
    } catch {
      // Docker not available or error — return DB data as-is
    }

    const liveMap = new Map(liveContainers.map(c => [c.name, c]))

    const enriched = dbContainers.map(c => {
      const live = liveMap.get(c.name)
      return {
        ...c,
        envVars: c.envVars ? JSON.parse(c.envVars) : {},
        volumes: c.volumes ? JSON.parse(c.volumes) : [],
        liveStatus: live?.state ?? null,
        liveStatusText: live?.status ?? null,
        ports: live?.ports ?? null,
      }
    })

    return reply.send({ success: true, data: enriched })
  })

  // GET /api/docker/:name/logs
  fastify.get('/:name/logs', { preHandler: [adminOnly] }, async (request, reply) => {
    const { name } = request.params as { name: string }
    const { lines = '100' } = request.query as { lines?: string }
    const caller = getRequestUser(request)

    const container = await prisma.dockerContainer.findUnique({ where: { name } })
    if (!container) return reply.code(404).send({ success: false, error: 'Kontener nie znaleziony' })
    if (caller.role !== 'admin' && container.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Brak dostępu' })
    }

    try {
      const logs = await getContainerLogs(name, Math.min(Number(lines) || 100, 500))
      return reply.send({ success: true, data: logs })
    } catch (err) {
      return reply.code(500).send({ success: false, error: String(err) })
    }
  })

  // POST /api/docker/:name/start
  fastify.post('/:name/start', { preHandler: [adminOnly] }, async (request, reply) => {
    const { name } = request.params as { name: string }
    const caller = getRequestUser(request)

    const container = await prisma.dockerContainer.findUnique({ where: { name } })
    if (!container) return reply.code(404).send({ success: false, error: 'Kontener nie znaleziony' })
    if (caller.role !== 'admin' && container.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Brak dostępu' })
    }

    await startContainer(name)
    await prisma.dockerContainer.update({ where: { name }, data: { status: 'running' } })
    return reply.send({ success: true, data: null })
  })

  // POST /api/docker/:name/stop
  fastify.post('/:name/stop', { preHandler: [adminOnly] }, async (request, reply) => {
    const { name } = request.params as { name: string }
    const caller = getRequestUser(request)

    const container = await prisma.dockerContainer.findUnique({ where: { name } })
    if (!container) return reply.code(404).send({ success: false, error: 'Kontener nie znaleziony' })
    if (caller.role !== 'admin' && container.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Brak dostępu' })
    }

    await stopContainer(name)
    await prisma.dockerContainer.update({ where: { name }, data: { status: 'stopped' } })
    return reply.send({ success: true, data: null })
  })

  // POST /api/docker/:name/restart
  fastify.post('/:name/restart', { preHandler: [adminOnly] }, async (request, reply) => {
    const { name } = request.params as { name: string }
    const caller = getRequestUser(request)

    const container = await prisma.dockerContainer.findUnique({ where: { name } })
    if (!container) return reply.code(404).send({ success: false, error: 'Kontener nie znaleziony' })
    if (caller.role !== 'admin' && container.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Brak dostępu' })
    }

    await restartContainer(name)
    await prisma.dockerContainer.update({ where: { name }, data: { status: 'running' } })
    return reply.send({ success: true, data: null })
  })

  // DELETE /api/docker/:name
  fastify.delete('/:name', { preHandler: [adminOnly] }, async (request, reply) => {
    const { name } = request.params as { name: string }
    const caller = getRequestUser(request)

    const container = await prisma.dockerContainer.findUnique({ where: { name } })
    if (!container) return reply.code(404).send({ success: false, error: 'Kontener nie znaleziony' })
    if (caller.role !== 'admin' && container.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Brak dostępu' })
    }

    // Remove nginx proxy if domain was set
    if (container.domain) {
      await deleteNginxVhost(container.domain).catch(() => {})
      await reloadNginx().catch(() => {})
    }

    // Remove docker container
    await removeContainer(name, true).catch(() => {})

    await prisma.dockerContainer.delete({ where: { name } })

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'docker.remove',
        resource: 'docker',
        resourceId: container.id,
        meta: JSON.stringify({ name, image: container.image }),
      },
    })

    return reply.send({ success: true, data: null })
  })

  // POST /api/docker/deploy
  fastify.post('/deploy', { preHandler: [adminOnly] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = deploySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' })
    }

    const { displayName, name, templateId, image, internalPort, domain, envVars, cpuLimit, memoryLimit } = body.data
    let { externalPort } = body.data

    // Check Docker available
    const dockerOk = await isDockerAvailable()
    if (!dockerOk) {
      return reply.code(503).send({ success: false, error: 'Docker nie jest dostępny na tym serwerze' })
    }

    // Check name uniqueness
    const existing = await prisma.dockerContainer.findUnique({ where: { name } })
    if (existing) {
      return reply.code(409).send({ success: false, error: 'Kontener o tej nazwie już istnieje' })
    }

    // Resolve template for volumes
    const tpl = getTemplate(templateId)

    // Generate auto env vars
    const resolvedEnv: Record<string, string> = { ...envVars }
    if (tpl) {
      for (const envDef of tpl.envVars) {
        if (envDef.generated && !resolvedEnv[envDef.key]) {
          resolvedEnv[envDef.key] = generateSecret(envDef.generated === 'password' ? 20 : 48)
        }
        // Replace {domain} placeholder
        if (resolvedEnv[envDef.key] && domain) {
          resolvedEnv[envDef.key] = resolvedEnv[envDef.key].replace('{domain}', domain)
        }
        if (envDef.default && !resolvedEnv[envDef.key]) {
          resolvedEnv[envDef.key] = domain
            ? envDef.default.replace('{domain}', domain)
            : envDef.default
        }
      }
    }

    // Find available external port
    if (!externalPort) {
      externalPort = await findAvailablePort(10000, 20000)
    }

    // Resolve volumes
    const volumes = tpl?.volumes.map(v => ({
      host: `/opt/docker-data/${name}/${v.hostPath}`,
      container: v.containerPath,
    })) ?? []

    // Create DB record immediately (status = deploying)
    const dbRecord = await prisma.dockerContainer.create({
      data: {
        name,
        displayName,
        image,
        domain: domain ?? null,
        internalPort,
        externalPort,
        status: 'deploying',
        template: templateId,
        envVars: JSON.stringify(resolvedEnv),
        volumes: JSON.stringify(volumes),
        userId: caller.id,
      },
    })

    reply.code(202).send({ success: true, data: { id: dbRecord.id, name, message: 'Wdrażanie w toku...' } })

    // Deploy in background
    setImmediate(async () => {
      try {
        // Create data directories
        for (const vol of volumes) {
          const { run: runCmd } = await import('../services/shell.js')
          await runCmd(`mkdir -p ${JSON.stringify(vol.host)}`).catch(() => {})
        }

        // Pull image
        await pullImage(image)

        // Create and start container
        await createAndStartContainer({
          name,
          image,
          externalPort: externalPort!,
          internalPort,
          envVars: resolvedEnv,
          volumes,
          restart: 'always',
          labels: {
            'overpanel.managed': 'true',
            'overpanel.template': templateId,
          },
          cpuLimit,
          memoryLimit,
        })

        // Nginx proxy if domain given
        if (domain) {
          await createDockerProxyVhost({ domain, externalPort: externalPort! })
          await reloadNginx()

          // Cloudflared integration
          const tunnelActive = await isTunnelActive()
          if (tunnelActive) {
            await addDomainToTunnel(domain).catch(() => {})
          }
        }

        // Update DB status
        await prisma.dockerContainer.update({
          where: { id: dbRecord.id },
          data: { status: 'running' },
        })

        await prisma.auditLog.create({
          data: {
            userId: caller.id,
            action: 'docker.deploy',
            resource: 'docker',
            resourceId: dbRecord.id,
            meta: JSON.stringify({ name, image, domain }),
          },
        })

        console.log(`[Docker] Deployed ${name} (${image}) on port ${externalPort}${domain ? ` → ${domain}` : ''}`)
      } catch (err) {
        console.error(`[Docker] Deploy failed for ${name}:`, err)
        await prisma.dockerContainer.update({
          where: { id: dbRecord.id },
          data: { status: 'error' },
        }).catch(() => {})
      }
    })
  })

  // POST /api/docker/:name/rebuild
  fastify.post('/:name/rebuild', { preHandler: [adminOnly] }, async (request, reply) => {
    const { name } = request.params as { name: string }
    const caller = getRequestUser(request)

    const container = await prisma.dockerContainer.findUnique({ where: { name } })
    if (!container) return reply.code(404).send({ success: false, error: 'Kontener nie znaleziony' })
    if (caller.role !== 'admin' && container.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Brak dostępu' })
    }

    // Update status to rebuilding
    await prisma.dockerContainer.update({ where: { name }, data: { status: 'deploying' } })

    reply.code(202).send({ success: true, data: { message: 'Przebudowywanie kontenera...' } })

    setImmediate(async () => {
      try {
        // Pull latest image
        await pullImage(container.image)

        // Stop and remove old container
        await stopContainer(name).catch(() => {})
        await removeContainer(name, false).catch(() => {})

        // Recreate with same config
        const envVars = container.envVars ? JSON.parse(container.envVars) : {}
        const volumes = container.volumes ? JSON.parse(container.volumes) : []

        await createAndStartContainer({
          name,
          image: container.image,
          externalPort: container.externalPort!,
          internalPort: container.internalPort!,
          envVars,
          volumes,
          restart: 'always',
          labels: {
            'overpanel.managed': 'true',
            'overpanel.template': container.template || 'custom',
          },
        })

        await prisma.dockerContainer.update({ where: { name }, data: { status: 'running' } })
        console.log(`[Docker] Rebuilt ${name}`)
      } catch (err) {
        console.error(`[Docker] Rebuild failed for ${name}:`, err)
        await prisma.dockerContainer.update({ where: { name }, data: { status: 'error' } }).catch(() => {})
      }
    })
  })
}
