import type { FastifyInstance } from 'fastify'
import { authMiddleware, getRequestUser } from '../middleware/auth.js'
import { prisma } from '@overpanel/db'
import { readdir, stat, mkdir, unlink, rename, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { createReadStream } from 'fs'
import { run } from '../services/shell.js'

const ROOT = '/var/www'

const TEXT_EXTENSIONS = new Set([
  '.php', '.html', '.htm', '.css', '.js', '.ts', '.json', '.txt', '.md',
  '.env', '.yml', '.yaml', '.xml', '.htaccess', '.conf', '.sh', '.py',
  '.rb', '.sql', '.log',
])

interface FileEntry {
  name: string
  path: string       // relative to /var/www
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
  permissions: string
  extension?: string
}

function safePath(inputPath: string): string {
  const cleaned = inputPath.replace(/^\/+/, '')
  const resolved = path.resolve(ROOT, cleaned)
  if (!resolved.startsWith(ROOT + '/') && resolved !== ROOT) {
    throw new Error('Path traversal detected')
  }
  return resolved
}

function toRelative(absPath: string): string {
  return absPath.slice(ROOT.length) || '/'
}

async function buildEntry(dir: string, name: string): Promise<FileEntry> {
  const full = path.join(dir, name)
  const s = await stat(full)
  const ext = path.extname(name).toLowerCase()
  return {
    name,
    path: toRelative(full),
    type: s.isDirectory() ? 'directory' : 'file',
    size: s.size,
    modifiedAt: s.mtime.toISOString(),
    permissions: (s.mode & 0o777).toString(8),
    extension: s.isDirectory() ? undefined : (ext || undefined),
  }
}

export async function filesRoutes(fastify: FastifyInstance) {
  // ── GET /list ────────────────────────────────────────────────────────────────
  fastify.get('/list', { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = getRequestUser(request)
    const query = request.query as { path?: string }

    let targetPath: string
    try {
      targetPath = query.path ? safePath(query.path) : ROOT
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid path' })
    }

    // Client access control: must be within one of their site dirs
    if (user.role !== 'admin') {
      const sites = await prisma.site.findMany({
        where: { userId: user.id },
        select: { domain: true },
      })
      const allowed = sites.some((s) => {
        const siteRoot = path.join(ROOT, s.domain)
        return targetPath.startsWith(siteRoot + '/') || targetPath === siteRoot
      })
      if (!allowed) {
        return reply.code(403).send({ success: false, error: 'Access denied — not your site directory' })
      }
    }

    if (!existsSync(targetPath)) {
      return reply.code(404).send({ success: false, error: 'Directory not found' })
    }

    let names: string[]
    try {
      names = await readdir(targetPath)
    } catch {
      return reply.code(500).send({ success: false, error: 'Cannot read directory' })
    }

    const entries = await Promise.all(
      names.map((name) => buildEntry(targetPath, name).catch(() => null))
    )

    const valid = entries.filter((e): e is FileEntry => e !== null)
    // Dirs first, then files, both alphabetical
    valid.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    const currentPath = toRelative(targetPath)
    const parentAbs = path.dirname(targetPath)
    const parentPath =
      targetPath === ROOT
        ? null
        : parentAbs.startsWith(ROOT)
        ? toRelative(parentAbs)
        : null

    return reply.send({
      success: true,
      data: { entries: valid, currentPath, parentPath },
    })
  })

  // ── GET /read ────────────────────────────────────────────────────────────────
  fastify.get('/read', { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = getRequestUser(request)
    const query = request.query as { path?: string }

    if (!query.path) {
      return reply.code(400).send({ success: false, error: 'path is required' })
    }

    let abs: string
    try {
      abs = safePath(query.path)
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid path' })
    }

    // Client access control
    if (user.role !== 'admin') {
      const sites = await prisma.site.findMany({
        where: { userId: user.id },
        select: { domain: true },
      })
      const allowed = sites.some((s) => {
        const siteRoot = path.join(ROOT, s.domain)
        return abs.startsWith(siteRoot + '/') || abs === siteRoot
      })
      if (!allowed) {
        return reply.code(403).send({ success: false, error: 'Access denied' })
      }
    }

    if (!existsSync(abs)) {
      return reply.code(404).send({ success: false, error: 'File not found' })
    }

    const s = await stat(abs)
    if (s.isDirectory()) {
      return reply.code(400).send({ success: false, error: 'Path is a directory' })
    }
    if (s.size > 1_048_576) {
      return reply.code(413).send({ success: false, error: 'File too large (max 1 MB)' })
    }

    const ext = path.extname(abs).toLowerCase()
    if (!TEXT_EXTENSIONS.has(ext) && ext !== '') {
      return reply.code(415).send({ success: false, error: 'Not a text file' })
    }

    const content = await readFile(abs, 'utf-8')
    return reply.send({ success: true, data: { content, path: toRelative(abs) } })
  })

  // ── POST /write ──────────────────────────────────────────────────────────────
  fastify.post('/write', { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = getRequestUser(request)
    const body = request.body as { path?: string; content?: string }

    if (!body.path || body.content === undefined) {
      return reply.code(400).send({ success: false, error: 'path and content are required' })
    }

    let abs: string
    try {
      abs = safePath(body.path)
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid path' })
    }

    if (user.role !== 'admin') {
      const sites = await prisma.site.findMany({
        where: { userId: user.id },
        select: { domain: true },
      })
      const allowed = sites.some((s) => {
        const siteRoot = path.join(ROOT, s.domain)
        return abs.startsWith(siteRoot + '/') || abs === siteRoot
      })
      if (!allowed) {
        return reply.code(403).send({ success: false, error: 'Access denied' })
      }
    }

    await writeFile(abs, body.content, 'utf-8')

    try {
      await run(`chown www-data:www-data "${abs}"`)
    } catch {
      // non-fatal — file still written
    }

    return reply.send({ success: true, data: null })
  })

  // ── POST /mkdir ──────────────────────────────────────────────────────────────
  fastify.post('/mkdir', { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = getRequestUser(request)
    const body = request.body as { path?: string }

    if (!body.path) {
      return reply.code(400).send({ success: false, error: 'path is required' })
    }

    let abs: string
    try {
      abs = safePath(body.path)
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid path' })
    }

    if (user.role !== 'admin') {
      const sites = await prisma.site.findMany({
        where: { userId: user.id },
        select: { domain: true },
      })
      const allowed = sites.some((s) => {
        const siteRoot = path.join(ROOT, s.domain)
        return abs.startsWith(siteRoot + '/') || abs === siteRoot
      })
      if (!allowed) {
        return reply.code(403).send({ success: false, error: 'Access denied' })
      }
    }

    await mkdir(abs, { recursive: true })

    try {
      await run(`chown -R www-data:www-data "${abs}"`)
    } catch {
      // non-fatal
    }

    return reply.send({ success: true, data: null })
  })

  // ── DELETE /delete ───────────────────────────────────────────────────────────
  fastify.delete('/delete', { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = getRequestUser(request)
    const body = request.body as { path?: string }

    if (!body.path) {
      return reply.code(400).send({ success: false, error: 'path is required' })
    }

    let abs: string
    try {
      abs = safePath(body.path)
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid path' })
    }

    // Never allow deleting ROOT itself
    if (abs === ROOT) {
      return reply.code(400).send({ success: false, error: 'Cannot delete root directory' })
    }

    if (user.role !== 'admin') {
      const sites = await prisma.site.findMany({
        where: { userId: user.id },
        select: { domain: true },
      })
      const allowed = sites.some((s) => {
        const siteRoot = path.join(ROOT, s.domain)
        return abs.startsWith(siteRoot + '/') || abs === siteRoot
      })
      if (!allowed) {
        return reply.code(403).send({ success: false, error: 'Access denied' })
      }
    }

    if (!existsSync(abs)) {
      return reply.code(404).send({ success: false, error: 'Path not found' })
    }

    const s = await stat(abs)
    if (s.isDirectory()) {
      await run(`rm -rf "${abs}"`)
    } else {
      await unlink(abs)
    }

    return reply.send({ success: true, data: null })
  })

  // ── POST /rename ─────────────────────────────────────────────────────────────
  fastify.post('/rename', { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = getRequestUser(request)
    const body = request.body as { from?: string; to?: string }

    if (!body.from || !body.to) {
      return reply.code(400).send({ success: false, error: 'from and to are required' })
    }

    let absFrom: string
    let absTo: string
    try {
      absFrom = safePath(body.from)
      absTo = safePath(body.to)
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid path' })
    }

    if (user.role !== 'admin') {
      const sites = await prisma.site.findMany({
        where: { userId: user.id },
        select: { domain: true },
      })
      const allowed = (p: string) =>
        sites.some((s) => {
          const siteRoot = path.join(ROOT, s.domain)
          return p.startsWith(siteRoot + '/') || p === siteRoot
        })
      if (!allowed(absFrom) || !allowed(absTo)) {
        return reply.code(403).send({ success: false, error: 'Access denied' })
      }
    }

    if (!existsSync(absFrom)) {
      return reply.code(404).send({ success: false, error: 'Source not found' })
    }

    await rename(absFrom, absTo)
    return reply.send({ success: true, data: null })
  })

  // ── GET /download ────────────────────────────────────────────────────────────
  fastify.get('/download', { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = getRequestUser(request)
    const query = request.query as { path?: string }

    if (!query.path) {
      return reply.code(400).send({ success: false, error: 'path is required' })
    }

    let abs: string
    try {
      abs = safePath(query.path)
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid path' })
    }

    if (user.role !== 'admin') {
      const sites = await prisma.site.findMany({
        where: { userId: user.id },
        select: { domain: true },
      })
      const allowed = sites.some((s) => {
        const siteRoot = path.join(ROOT, s.domain)
        return abs.startsWith(siteRoot + '/') || abs === siteRoot
      })
      if (!allowed) {
        return reply.code(403).send({ success: false, error: 'Access denied' })
      }
    }

    if (!existsSync(abs)) {
      return reply.code(404).send({ success: false, error: 'File not found' })
    }

    const s = await stat(abs)
    if (s.isDirectory()) {
      return reply.code(400).send({ success: false, error: 'Cannot download a directory' })
    }

    const filename = path.basename(abs)
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Length', String(s.size))

    return reply.send(createReadStream(abs))
  })

  // ── POST /chmod ───────────────────────────────────────────────────────────────
  fastify.post('/chmod', { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = getRequestUser(request)
    const body = request.body as { path?: string; mode?: string }

    if (!body.path || !body.mode) {
      return reply.code(400).send({ success: false, error: 'path and mode are required' })
    }

    if (!/^[0-7]{3,4}$/.test(body.mode)) {
      return reply.code(400).send({ success: false, error: 'Invalid mode — must be 3-4 octal digits (e.g. 755)' })
    }

    let resolvedPath: string
    try {
      resolvedPath = safePath(body.path)
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid path' })
    }

    if (user.role !== 'admin') {
      const sites = await prisma.site.findMany({
        where: { userId: user.id },
        select: { domain: true },
      })
      const allowed = sites.some((s) => {
        const siteRoot = path.join(ROOT, s.domain)
        return resolvedPath.startsWith(siteRoot + '/') || resolvedPath === siteRoot
      })
      if (!allowed) {
        return reply.code(403).send({ success: false, error: 'Access denied — not your site directory' })
      }
    }

    if (!existsSync(resolvedPath)) {
      return reply.code(404).send({ success: false, error: 'Path not found' })
    }

    await run(`chmod ${body.mode} ${JSON.stringify(resolvedPath)}`)

    return reply.send({ success: true, data: null })
  })

  // ── POST /upload (base64) ─────────────────────────────────────────────────────
  fastify.post('/upload', { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = getRequestUser(request)
    const body = request.body as { path?: string; filename?: string; content?: string }

    if (!body.path || !body.filename || !body.content) {
      return reply.code(400).send({ success: false, error: 'path, filename and content (base64) are required' })
    }

    // Validate filename: no path separators
    if (body.filename.includes('/') || body.filename.includes('\\') || body.filename.includes('..')) {
      return reply.code(400).send({ success: false, error: 'Invalid filename' })
    }

    let absDir: string
    try {
      absDir = safePath(body.path)
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid path' })
    }

    const absFile = path.join(absDir, body.filename)
    // Re-validate the final file path
    if (!absFile.startsWith(ROOT + '/') && absFile !== ROOT) {
      return reply.code(400).send({ success: false, error: 'Path traversal detected' })
    }

    if (user.role !== 'admin') {
      const sites = await prisma.site.findMany({
        where: { userId: user.id },
        select: { domain: true },
      })
      const allowed = sites.some((s) => {
        const siteRoot = path.join(ROOT, s.domain)
        return absFile.startsWith(siteRoot + '/') || absFile === siteRoot
      })
      if (!allowed) {
        return reply.code(403).send({ success: false, error: 'Access denied' })
      }
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from(body.content, 'base64')
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid base64 content' })
    }

    // Ensure directory exists
    if (!existsSync(absDir)) {
      await mkdir(absDir, { recursive: true })
    }

    await writeFile(absFile, buffer)

    try {
      await run(`chown www-data:www-data "${absFile}"`)
    } catch {
      // non-fatal
    }

    return reply.send({ success: true, data: { path: toRelative(absFile) } })
  })
}
