import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { adminOnly } from '../middleware/auth.js'
import { run } from '../services/shell.js'

const COMPOSE_DIR = '/opt/docker-compose-projects'

const composeDeploySchema = z.object({
  projectName: z.string().min(2).max(50).regex(/^[a-z0-9][a-z0-9_-]*$/),
  composeContent: z.string().min(1).max(50000),
  domain: z.string().optional(),
})

export async function dockerComposeRoutes(fastify: FastifyInstance) {

  // GET /api/docker-compose — list projects
  fastify.get('/', { preHandler: [adminOnly] }, async (_req, reply) => {
    try {
      const result = await run(`ls ${COMPOSE_DIR} 2>/dev/null || echo ""`).catch(() => ({ stdout: '' }))
      const projects = result.stdout.trim().split('\n').filter(Boolean)

      const enriched = await Promise.all(projects.map(async (name) => {
        const psResult = await run(`docker compose -p ${name} -f ${COMPOSE_DIR}/${name}/docker-compose.yml ps --format json 2>/dev/null || echo "[]"`).catch(() => ({ stdout: '[]' }))
        let services: any[] = []
        try { services = JSON.parse(psResult.stdout) } catch { services = [] }
        return { name, services, running: services.filter((s: any) => s.State === 'running').length }
      }))

      return reply.send({ success: true, data: enriched })
    } catch (err) {
      return reply.send({ success: true, data: [] })
    }
  })

  // POST /api/docker-compose/deploy
  fastify.post('/deploy', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = composeDeploySchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.errors[0]?.message })

    const { projectName, composeContent } = body.data

    // Check docker compose available
    const dockerCheck = await run('docker compose version 2>/dev/null || echo ""').catch(() => ({ stdout: '' }))
    if (!dockerCheck.stdout.trim()) {
      return reply.code(503).send({ success: false, error: 'Docker Compose nie jest dostępny' })
    }

    const projectDir = `${COMPOSE_DIR}/${projectName}`
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(`${projectDir}/docker-compose.yml`, composeContent)

    reply.code(202).send({ success: true, data: { projectName, message: 'Uruchamianie projektu...' } })

    setImmediate(async () => {
      try {
        await run(`docker compose -p ${projectName} -f ${projectDir}/docker-compose.yml up -d --pull always`)
        console.log(`[DockerCompose] Deployed ${projectName}`)
      } catch (err) {
        console.error(`[DockerCompose] Deploy failed:`, err)
      }
    })
  })

  // GET /api/docker-compose/:project/logs
  fastify.get('/:project/logs', { preHandler: [adminOnly] }, async (request, reply) => {
    const { project } = request.params as { project: string }
    const projectDir = `${COMPOSE_DIR}/${project}`
    if (!existsSync(`${projectDir}/docker-compose.yml`)) {
      return reply.code(404).send({ success: false, error: 'Projekt nie znaleziony' })
    }
    try {
      const logs = await run(`docker compose -p ${project} -f ${projectDir}/docker-compose.yml logs --tail=100 2>&1`)
      return reply.send({ success: true, data: logs.stdout })
    } catch (err) {
      return reply.code(500).send({ success: false, error: String(err) })
    }
  })

  // DELETE /api/docker-compose/:project
  fastify.delete('/:project', { preHandler: [adminOnly] }, async (request, reply) => {
    const { project } = request.params as { project: string }
    const projectDir = `${COMPOSE_DIR}/${project}`
    if (!existsSync(`${projectDir}/docker-compose.yml`)) {
      return reply.code(404).send({ success: false, error: 'Projekt nie znaleziony' })
    }
    try {
      await run(`docker compose -p ${project} -f ${projectDir}/docker-compose.yml down -v`)
      await run(`rm -rf ${JSON.stringify(projectDir)}`)
      return reply.send({ success: true, data: null })
    } catch (err) {
      return reply.code(500).send({ success: false, error: String(err) })
    }
  })

  // GET /api/docker-compose/:project/content — get compose file content
  fastify.get('/:project/content', { preHandler: [adminOnly] }, async (request, reply) => {
    const { project } = request.params as { project: string }
    const filePath = `${COMPOSE_DIR}/${project}/docker-compose.yml`
    if (!existsSync(filePath)) {
      return reply.code(404).send({ success: false, error: 'Projekt nie znaleziony' })
    }
    const content = readFileSync(filePath, 'utf8')
    return reply.send({ success: true, data: content })
  })

  // POST /api/docker-compose/:project/stop
  fastify.post('/:project/stop', { preHandler: [adminOnly] }, async (request, reply) => {
    const { project } = request.params as { project: string }
    const projectDir = `${COMPOSE_DIR}/${project}`
    await run(`docker compose -p ${project} -f ${projectDir}/docker-compose.yml stop`).catch(() => {})
    return reply.send({ success: true, data: null })
  })

  // POST /api/docker-compose/:project/start
  fastify.post('/:project/start', { preHandler: [adminOnly] }, async (request, reply) => {
    const { project } = request.params as { project: string }
    const projectDir = `${COMPOSE_DIR}/${project}`
    await run(`docker compose -p ${project} -f ${projectDir}/docker-compose.yml start`).catch(() => {})
    return reply.send({ success: true, data: null })
  })
}
