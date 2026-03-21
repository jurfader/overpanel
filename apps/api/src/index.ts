import 'dotenv/config'
import Fastify from 'fastify'
import { Server as SocketServer } from 'socket.io'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'

import { authRoutes } from './routes/auth.js'
import { sitesRoutes } from './routes/sites.js'
import { databasesRoutes } from './routes/databases.js'
import { usersRoutes } from './routes/users.js'
import { systemRoutes } from './routes/system.js'
import { dnsRoutes } from './routes/dns.js'
import { wordpressRoutes } from './routes/wordpress.js'
import { firewallRoutes } from './routes/firewall.js'
import { logsRoutes } from './routes/logs.js'
import { cronRoutes } from './routes/cron.js'
import { ftpRoutes } from './routes/ftp.js'
import { backupsRoutes } from './routes/backups.js'
import { settingsRoutes } from './routes/settings.js'
import { filesRoutes } from './routes/files.js'
import { dockerRoutes } from './routes/docker.js'
import { dockerComposeRoutes } from './routes/docker-compose.js'
import { nodejsRoutes } from './routes/nodejs.js'
import { phpRoutes } from './routes/php.js'
import { sslRoutes } from './routes/ssl.js'
import { startStatsEmitter } from './system/stats-emitter.js'
import { startBackupScheduler } from './services/backup-scheduler.js'
import { authMiddleware } from './middleware/auth.js'
import { prisma } from '@overpanel/db'
import { createSession, destroySession, writeSession, resizeSession } from './services/terminal.js'

const PORT = Number(process.env.PORT ?? 4000)
const HOST = process.env.HOST ?? '0.0.0.0'
const JWT_SECRET = process.env.JWT_SECRET ?? 'overpanel-dev-secret-change-in-production'
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3333'

async function bootstrap() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  // ── Plugins ──────────────────────────────────────────────────────────────
  await fastify.register(helmet, { contentSecurityPolicy: false })

  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })

  await fastify.register(cookie)

  await fastify.register(jwt, {
    secret: JWT_SECRET,
    cookie: { cookieName: 'op_token', signed: false },
  })

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // ── Auth decorator ────────────────────────────────────────────────────────
  fastify.decorate('authenticate', authMiddleware)

  // ── Routes ────────────────────────────────────────────────────────────────
  await fastify.register(authRoutes, { prefix: '/api/auth' })
  await fastify.register(sitesRoutes, { prefix: '/api/sites' })
  await fastify.register(databasesRoutes, { prefix: '/api/databases' })
  await fastify.register(usersRoutes, { prefix: '/api/users' })
  await fastify.register(systemRoutes, { prefix: '/api/system' })
  await fastify.register(dnsRoutes, { prefix: '/api/dns' })
  await fastify.register(wordpressRoutes, { prefix: '/api/wordpress' })
  await fastify.register(firewallRoutes, { prefix: '/api/firewall' })
  await fastify.register(logsRoutes, { prefix: '/api/logs' })
  await fastify.register(cronRoutes, { prefix: '/api/cron' })
  await fastify.register(ftpRoutes, { prefix: '/api/ftp' })
  await fastify.register(backupsRoutes, { prefix: '/api/backups' })
  await fastify.register(settingsRoutes, { prefix: '/api/settings' })
  await fastify.register(filesRoutes, { prefix: '/api/files' })
  await fastify.register(dockerRoutes, { prefix: '/api/docker' })
  await fastify.register(dockerComposeRoutes, { prefix: '/api/docker-compose' })
  await fastify.register(nodejsRoutes, { prefix: '/api/nodejs' })
  await fastify.register(phpRoutes, { prefix: '/api/php' })
  await fastify.register(sslRoutes, { prefix: '/api/ssl' })

  // ── Health check ──────────────────────────────────────────────────────────
  fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  // ── System counts (dashboard stats) ──────────────────────────────────────
  fastify.get('/api/system/counts', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const caller = request.user as { id: string; role: string }
    const isAdmin = caller.role === 'admin'
    const where = isAdmin ? {} : { userId: caller.id }

    const [sitesCount, dbCount, usersCount, sslCount] = await Promise.all([
      prisma.site.count({ where }),
      prisma.database.count({ where }),
      isAdmin ? prisma.user.count() : Promise.resolve(null),
      prisma.site.count({ where: { ...where, hasSSL: true } }),
    ])

    return reply.send({
      success: true,
      data: { sitesCount, dbCount, usersCount, sslCount },
    })
  })

  // ── Start server first, then attach Socket.io ─────────────────────────────
  await fastify.listen({ port: PORT, host: HOST })

  // Socket.io korzysta z tego samego serwera HTTP co Fastify
  const io = new SocketServer(fastify.server, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    pingTimeout: 30000,
    pingInterval: 25000,
  })

  // Auth guard dla Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined
    if (!token) return next(new Error('Unauthorized'))
    try {
      fastify.jwt.verify(token)
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  // Start real-time stats emitter
  startStatsEmitter(io)

  // ── Terminal namespace (admin-only) ───────────────────────────────────────
  const terminal = io.of('/terminal')

  terminal.use((socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined
    if (!token) return next(new Error('Unauthorized'))
    try {
      const payload = fastify.jwt.verify(token) as { role?: string }
      if (payload.role !== 'admin') return next(new Error('Forbidden — admin only'))
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  terminal.on('connection', (socket) => {
    const qCols = Number(socket.handshake.query['cols']) || 80
    const qRows = Number(socket.handshake.query['rows']) || 24

    fastify.log.info(`Terminal connection: ${socket.id} (${qCols}x${qRows})`)

    createSession(socket.id, qCols, qRows).then((session) => {
      fastify.log.info(`Terminal session created: pid=${session.pid}`)

      // Stream PTY output → client
      session.term.onData((data) => {
        socket.emit('data', data)
      })

      session.term.onExit(({ exitCode }) => {
        fastify.log.info(`Terminal exited: code=${exitCode}`)
        socket.emit('exit', exitCode)
        socket.disconnect()
      })
    }).catch((err) => {
      fastify.log.error(`Terminal session failed: ${err.message}`)
      socket.emit('data', `\r\n\x1b[31mTerminal error: ${err.message}\x1b[0m\r\n`)
      socket.disconnect()
    })

    // Client → PTY input
    socket.on('input', (data: string) => {
      writeSession(socket.id, data)
    })

    // Resize
    socket.on('resize', ({ cols, rows }: { cols: number; rows: number }) => {
      resizeSession(socket.id, cols, rows)
    })

    // Cleanup on disconnect
    socket.on('disconnect', () => {
      destroySession(socket.id)
    })
  })

  // Start automated backup scheduler
  startBackupScheduler()

  fastify.log.info(`OVERPANEL API running on http://${HOST}:${PORT}`)
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err)
  process.exit(1)
})
