import type { FastifyInstance } from 'fastify'
import si from 'systeminformation'
import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { adminOnly, authMiddleware, getRequestUser } from '../middleware/auth.js'
import { prisma } from '@overpanel/db'

const execAsync = promisify(exec)

const UPDATE_STATUS_FILE = '/tmp/overpanel-update.json'

function getRepoRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
  } catch {
    return '/opt/overpanel'
  }
}

async function writeUpdateStatus(status: {
  status: 'running' | 'success' | 'failed'
  log: string[]
  startedAt: string
  completedAt?: string
}): Promise<void> {
  await writeFile(UPDATE_STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8')
}

export async function systemRoutes(fastify: FastifyInstance) {
  // GET /api/system/info — statyczne info o serwerze
  fastify.get('/info', { preHandler: [adminOnly] }, async (_req, reply) => {
    const [os, cpu, mem, disk] = await Promise.all([
      si.osInfo(),
      si.cpu(),
      si.mem(),
      si.fsSize(),
    ])

    return reply.send({
      success: true,
      data: {
        os: { distro: os.distro, release: os.release, arch: os.arch, hostname: os.hostname },
        cpu: { manufacturer: cpu.manufacturer, brand: cpu.brand, cores: cpu.cores, speed: cpu.speed },
        ram: { total: mem.total },
        disk: disk.map((d) => ({ mount: d.mount, size: d.size, used: d.used, fs: d.type })),
      },
    })
  })

  // GET /api/system/notifications — powiadomienia i alerty
  fastify.get('/notifications', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const where = caller.role === 'admin' ? {} : { userId: caller.id }

    const alerts: Array<{
      id: string
      type: string
      title: string
      message: string
      severity: 'warning' | 'error' | 'info'
      createdAt: Date
    }> = []

    // SSL expiry check — sites with SSL expiring within 30 days
    const expiringSites = await prisma.site.findMany({
      where: {
        ...where,
        hasSSL: true,
        sslExpiry: { lt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, domain: true, sslExpiry: true },
    })
    for (const s of expiringSites) {
      const days = Math.ceil((new Date(s.sslExpiry!).getTime() - Date.now()) / 86400000)
      alerts.push({
        id: `ssl-${s.id}`,
        type: 'ssl_expiry',
        title: 'SSL wygasa',
        message: `${s.domain} — za ${days} dni`,
        severity: days < 7 ? 'error' : 'warning',
        createdAt: new Date(),
      })
    }

    // Disk usage check — admin only (global disk info)
    if (caller.role === 'admin') {
      try {
        const fsData = await si.fsSize()
        for (const fs of fsData) {
          if (fs.use > 85) {
            alerts.push({
              id: `disk-${fs.fs}`,
              type: 'disk_warning',
              title: 'Mało miejsca',
              message: `${fs.fs}: ${fs.use}% użyte`,
              severity: fs.use > 95 ? 'error' : 'warning',
              createdAt: new Date(),
            })
          }
        }
      } catch {
        // non-fatal — skip disk check if systeminformation fails
      }
    }

    // Inactive sites check
    const inactiveSites = await prisma.site.findMany({
      where: { ...where, status: 'inactive' },
      select: { id: true, domain: true },
    })
    for (const s of inactiveSites) {
      alerts.push({
        id: `site-down-${s.id}`,
        type: 'site_down',
        title: 'Strona nieaktywna',
        message: `${s.domain} ma status nieaktywny`,
        severity: 'warning',
        createdAt: new Date(),
      })
    }

    return reply.send({ success: true, data: alerts })
  })

  // GET /api/system/update-check — sprawdź dostępność aktualizacji
  fastify.get('/update-check', { preHandler: [adminOnly] }, async (_req, reply) => {
    const repoDir = getRepoRoot()

    let commits: string[] = []
    let hasUpdates = false

    try {
      await execAsync(`git -C ${repoDir} fetch origin main 2>/dev/null || true`)
      const { stdout } = await execAsync(
        `git -C ${repoDir} log HEAD..origin/main --oneline 2>/dev/null || true`
      )
      commits = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      hasUpdates = commits.length > 0
    } catch {
      // Could not reach remote — treat as no updates
    }

    // Build version string: semver from package.json + short commit hash
    let currentVersion = 'unknown'
    try {
      const pkgPath = `${repoDir}/package.json`
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
        currentVersion = pkg.version ?? '0.0.0'
      }
    } catch {}

    // Append short commit hash for traceability
    try {
      const { stdout: hashOut } = await execAsync(
        `git -C ${repoDir} rev-parse --short HEAD 2>/dev/null`
      )
      const hash = hashOut.trim()
      if (hash) currentVersion += `+${hash}`
    } catch {}

    return reply.send({ success: true, data: { hasUpdates, commits, currentVersion } })
  })

  // POST /api/system/update — uruchom aktualizację w tle
  fastify.post('/update', { preHandler: [adminOnly] }, async (_req, reply) => {
    const repoDir = getRepoRoot()
    const startedAt = new Date().toISOString()

    const initialStatus = {
      status: 'running' as const,
      log: ['Update started'],
      startedAt,
    }
    await writeUpdateStatus(initialStatus)

    setImmediate(async () => {
      const log: string[] = ['Update started']

      async function step(label: string, cmd: string): Promise<boolean> {
        log.push(`> ${label}`)
        await writeUpdateStatus({ status: 'running', log, startedAt })
        try {
          const { stdout, stderr } = await execAsync(cmd, { timeout: 300_000 })
          if (stdout.trim()) log.push(stdout.trim())
          if (stderr.trim()) log.push(stderr.trim())
          log.push(`✓ ${label}`)
          return true
        } catch (err: any) {
          log.push(`✗ ${label}: ${err?.message ?? String(err)}`)
          return false
        }
      }

      const steps: Array<[string, string]> = [
        ['git pull', `git -C ${repoDir} pull origin main`],
        ['pnpm install', `cd ${repoDir} && pnpm install --no-frozen-lockfile`],
        ['prisma generate', `cd ${repoDir}/packages/db && npx prisma generate`],
        ['build packages', `cd ${repoDir} && pnpm --filter @overpanel/shared build && pnpm --filter @overpanel/db build`],
        ['build api', `cd ${repoDir} && pnpm --filter @overpanel/api build`],
        ['build web', `cd ${repoDir}/apps/web && pnpm build`],
        ['copy static', `cd ${repoDir}/apps/web && if [ -d .next/standalone/apps/web ]; then cp -r public .next/standalone/apps/web/public 2>/dev/null; mkdir -p .next/standalone/apps/web/.next; cp -r .next/static .next/standalone/apps/web/.next/static 2>/dev/null; fi; true`],
      ]

      for (const [label, cmd] of steps) {
        const ok = await step(label, cmd)
        if (!ok) {
          await writeUpdateStatus({
            status: 'failed',
            log,
            startedAt,
            completedAt: new Date().toISOString(),
          })
          return
        }
      }

      // Write success BEFORE restarting — restart kills this process
      log.push('Update completed successfully — restarting services...')
      await writeUpdateStatus({
        status: 'success',
        log,
        startedAt,
        completedAt: new Date().toISOString(),
      })

      // Restart web first (doesn't kill us), then schedule API restart with delay
      await execAsync('systemctl restart overpanel-web').catch(() => {})
      // Give 1s for status file to be read by polling, then restart ourselves
      setTimeout(() => {
        execAsync('systemctl restart overpanel-api').catch(() => {})
      }, 1500)
    })

    return reply.code(202).send({ success: true, data: { message: 'Aktualizacja uruchomiona' } })
  })

  // GET /api/system/update-status — odczytaj status aktualizacji
  fastify.get('/update-status', { preHandler: [adminOnly] }, async (_req, reply) => {
    if (!existsSync(UPDATE_STATUS_FILE)) {
      return reply.send({ success: true, data: null })
    }

    try {
      const raw = await readFile(UPDATE_STATUS_FILE, 'utf-8')
      const data = JSON.parse(raw)
      return reply.send({ success: true, data })
    } catch {
      return reply.send({ success: true, data: null })
    }
  })
}
