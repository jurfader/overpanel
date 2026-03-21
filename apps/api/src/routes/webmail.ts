import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@overpanel/db'
import { authMiddleware, getRequestUser } from '../middleware/auth.js'
import { jmapSession, jmapRequest, jmapUpload, jmapDownloadUrl } from '../services/jmap.js'
import {
  createSession,
  getSession,
  destroySession,
} from '../services/webmail-session.js'

// ── Zod schemas ──────────────────────────────────────────────────────────────

const connectSchema = z.object({
  mailboxAddress: z.string().email('Invalid mailbox address'),
  password: z.string().min(1, 'Password is required'),
})

const disconnectSchema = z.object({
  mailboxAddress: z.string().email('Invalid mailbox address'),
})

const sendSchema = z.object({
  mailbox: z.string().email(),
  to: z.array(z.object({ name: z.string().optional(), email: z.string().email() })).min(1),
  cc: z.array(z.object({ name: z.string().optional(), email: z.string().email() })).optional(),
  bcc: z.array(z.object({ name: z.string().optional(), email: z.string().email() })).optional(),
  subject: z.string(),
  htmlBody: z.string(),
  textBody: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
  attachmentBlobIds: z.array(z.string()).optional(),
})

const searchSchema = z.object({
  mailbox: z.string().email(),
  query: z.string().min(1, 'Query is required'),
  folderId: z.string().optional(),
})

const moveSchema = z.object({
  mailbox: z.string().email(),
  folderId: z.string().min(1, 'folderId is required'),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireSession(userId: string, mailbox: string) {
  const session = getSession(userId, mailbox)
  if (!session) {
    return null
  }
  return session
}

function formatAddress(addr: any) {
  return { name: addr.name || null, email: addr.email || '' }
}

// Extract body text from JMAP bodyParts + bodyValues
function extractBodyValue(bodyParts: any[], bodyValues: Record<string, any>): string {
  if (!bodyParts || !Array.isArray(bodyParts) || bodyParts.length === 0) return ''
  if (!bodyValues) return ''
  const partId = bodyParts[0]?.partId
  if (!partId) return ''
  return bodyValues[partId]?.value ?? ''
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function webmailRoutes(fastify: FastifyInstance) {

  // ── POST /connect — authenticate to a mailbox via JMAP ────────────────────

  fastify.post('/connect', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = connectSchema.safeParse(request.body)

    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const { mailboxAddress, password } = body.data

    // Verify the mailbox exists and belongs to the user (or user is admin)
    const mailbox = await prisma.mailbox.findUnique({
      where: { address: mailboxAddress },
      include: { domain: true },
    })

    if (!mailbox) {
      return reply.code(404).send({ success: false, error: 'Mailbox not found' })
    }

    if (caller.role !== 'admin' && mailbox.userId !== caller.id) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    // Authenticate via JMAP
    let sessionInfo
    try {
      sessionInfo = await jmapSession(mailboxAddress, password)
    } catch (err: any) {
      return reply.code(401).send({
        success: false,
        error: 'Failed to authenticate with mail server: ' + (err.message ?? 'Unknown error'),
      })
    }

    // Store session
    createSession(caller.id, mailboxAddress, {
      email: mailboxAddress,
      password,
      accountId: sessionInfo.accountId,
      apiUrl: sessionInfo.apiUrl,
      downloadUrl: sessionInfo.downloadUrl,
      uploadUrl: sessionInfo.uploadUrl,
      lastUsed: Date.now(),
    })

    return reply.send({
      success: true,
      data: { accountId: sessionInfo.accountId, mailbox: mailboxAddress },
    })
  })

  // ── POST /disconnect — destroy webmail session ────────────────────────────

  fastify.post('/disconnect', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = disconnectSchema.safeParse(request.body)

    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    destroySession(caller.id, body.data.mailboxAddress)
    return reply.send({ success: true })
  })

  // ── GET /session?mailbox=X — check if session is active ──────────────────

  fastify.get('/session', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const { mailbox } = request.query as { mailbox?: string }

    if (!mailbox) {
      return reply.code(400).send({ success: false, error: 'mailbox query parameter is required' })
    }

    const session = getSession(caller.id, mailbox)
    return reply.send({
      success: true,
      data: { active: session !== null, mailbox },
    })
  })

  // ── GET /folders?mailbox=X — list JMAP mailboxes (folders) ────────────────

  fastify.get('/folders', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const { mailbox } = request.query as { mailbox?: string }

    if (!mailbox) {
      return reply.code(400).send({ success: false, error: 'mailbox query parameter is required' })
    }

    const session = requireSession(caller.id, mailbox)
    if (!session) {
      return reply.code(401).send({ success: false, error: 'No active webmail session' })
    }

    try {
      const response = await jmapRequest(session.email, session.password, [
        [
          'Mailbox/get',
          {
            accountId: session.accountId,
            properties: ['id', 'name', 'role', 'sortOrder', 'totalEmails', 'unreadEmails', 'parentId'],
          },
          '0',
        ],
      ])

      const mailboxes = response.methodResponses?.[0]?.[1]?.list ?? []

      const folders = mailboxes.map((m: any) => ({
        id: m.id,
        name: m.name,
        role: m.role ?? null,
        parentId: m.parentId ?? null,
        sortOrder: m.sortOrder ?? 0,
        unreadCount: m.unreadEmails ?? 0,
        totalCount: m.totalEmails ?? 0,
      }))

      return reply.send({ success: true, data: folders })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to fetch folders',
      })
    }
  })

  // ── GET /messages?mailbox=X&folderId=Y&page=1&limit=50 — list messages ───

  fastify.get('/messages', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const query = request.query as {
      mailbox?: string
      folderId?: string
      page?: string
      limit?: string
    }

    if (!query.mailbox) {
      return reply.code(400).send({ success: false, error: 'mailbox query parameter is required' })
    }
    if (!query.folderId) {
      return reply.code(400).send({ success: false, error: 'folderId query parameter is required' })
    }

    const session = requireSession(caller.id, query.mailbox)
    if (!session) {
      return reply.code(401).send({ success: false, error: 'No active webmail session' })
    }

    const page = Math.max(1, parseInt(query.page ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10)))
    const position = (page - 1) * limit

    try {
      const response = await jmapRequest(session.email, session.password, [
        [
          'Email/query',
          {
            accountId: session.accountId,
            filter: { inMailbox: query.folderId },
            sort: [{ property: 'receivedAt', isAscending: false }],
            position,
            limit,
            calculateTotal: true,
          },
          '0',
        ],
        [
          'Email/get',
          {
            accountId: session.accountId,
            '#ids': { resultOf: '0', name: 'Email/query', path: '/ids' },
            properties: [
              'id', 'from', 'to', 'subject', 'receivedAt', 'preview',
              'keywords', 'hasAttachment', 'size',
            ],
          },
          '1',
        ],
      ])

      const queryResult = response.methodResponses?.[0]?.[1] ?? {}
      const getResult = response.methodResponses?.[1]?.[1] ?? {}
      const total = queryResult.total ?? 0
      const emails = getResult.list ?? []

      const messages = emails.map((e: any) => ({
        id: e.id,
        from: e.from ?? [],
        to: e.to ?? [],
        subject: e.subject ?? '(no subject)',
        receivedAt: e.receivedAt,
        preview: e.preview ?? '',
        isRead: !!(e.keywords?.['$seen']),
        isFlagged: !!(e.keywords?.['$flagged']),
        hasAttachment: e.hasAttachment ?? false,
        size: e.size ?? 0,
      }))

      return reply.send({ success: true, data: { messages, total } })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to fetch messages',
      })
    }
  })

  // ── GET /messages/:id?mailbox=X — get a single message with full body ─────

  fastify.get('/messages/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const { id } = request.params as { id: string }
    const { mailbox } = request.query as { mailbox?: string }

    if (!mailbox) {
      return reply.code(400).send({ success: false, error: 'mailbox query parameter is required' })
    }

    const session = requireSession(caller.id, mailbox)
    if (!session) {
      return reply.code(401).send({ success: false, error: 'No active webmail session' })
    }

    try {
      const response = await jmapRequest(session.email, session.password, [
        [
          'Email/get',
          {
            accountId: session.accountId,
            ids: [id],
            properties: [
              'id', 'blobId', 'threadId', 'mailboxIds', 'from', 'to', 'cc', 'bcc',
              'replyTo', 'subject', 'sentAt', 'receivedAt', 'preview',
              'keywords', 'hasAttachment', 'size',
              'htmlBody', 'textBody', 'bodyValues', 'attachments',
              'messageId', 'inReplyTo', 'references',
            ],
            fetchHTMLBodyValues: true,
            fetchTextBodyValues: true,
          },
          '0',
        ],
      ])

      const emails = response.methodResponses?.[0]?.[1]?.list ?? []
      if (emails.length === 0) {
        return reply.code(404).send({ success: false, error: 'Message not found' })
      }

      const email = emails[0]

      return reply.send({
        success: true,
        data: {
          id: email.id,
          blobId: email.blobId,
          threadId: email.threadId,
          mailboxIds: email.mailboxIds,
          from: email.from ?? [],
          to: email.to ?? [],
          cc: email.cc ?? [],
          bcc: email.bcc ?? [],
          replyTo: email.replyTo ?? [],
          subject: email.subject ?? '(no subject)',
          sentAt: email.sentAt,
          receivedAt: email.receivedAt,
          preview: email.preview ?? '',
          isRead: !!(email.keywords?.['$seen']),
          isFlagged: !!(email.keywords?.['$flagged']),
          hasAttachment: email.hasAttachment ?? false,
          size: email.size ?? 0,
          htmlBody: extractBodyValue(email.htmlBody, email.bodyValues),
          textBody: extractBodyValue(email.textBody, email.bodyValues),
          attachments: (email.attachments ?? []).map((att: any) => ({
            ...att,
            downloadUrl: jmapDownloadUrl(session.accountId, att.blobId, att.name || 'attachment'),
          })),
          messageId: email.messageId ?? [],
          inReplyTo: email.inReplyTo ?? [],
          references: email.references ?? [],
        },
      })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to fetch message',
      })
    }
  })

  // ── POST /messages/:id/read?mailbox=X — mark as read ─────────────────────

  fastify.post('/messages/:id/read', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const { id } = request.params as { id: string }
    const { mailbox } = request.query as { mailbox?: string }

    if (!mailbox) {
      return reply.code(400).send({ success: false, error: 'mailbox query parameter is required' })
    }

    const session = requireSession(caller.id, mailbox)
    if (!session) {
      return reply.code(401).send({ success: false, error: 'No active webmail session' })
    }

    try {
      await jmapRequest(session.email, session.password, [
        [
          'Email/set',
          {
            accountId: session.accountId,
            update: {
              [id]: { 'keywords/$seen': true },
            },
          },
          '0',
        ],
      ])

      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to mark message as read',
      })
    }
  })

  // ── POST /messages/:id/unread?mailbox=X — mark as unread ─────────────────

  fastify.post('/messages/:id/unread', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const { id } = request.params as { id: string }
    const { mailbox } = request.query as { mailbox?: string }

    if (!mailbox) {
      return reply.code(400).send({ success: false, error: 'mailbox query parameter is required' })
    }

    const session = requireSession(caller.id, mailbox)
    if (!session) {
      return reply.code(401).send({ success: false, error: 'No active webmail session' })
    }

    try {
      await jmapRequest(session.email, session.password, [
        [
          'Email/set',
          {
            accountId: session.accountId,
            update: {
              [id]: { 'keywords/$seen': null },
            },
          },
          '0',
        ],
      ])

      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to mark message as unread',
      })
    }
  })

  // ── POST /messages/:id/flag?mailbox=X — toggle flagged ───────────────────

  fastify.post('/messages/:id/flag', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const { id } = request.params as { id: string }
    const { mailbox } = request.query as { mailbox?: string }

    if (!mailbox) {
      return reply.code(400).send({ success: false, error: 'mailbox query parameter is required' })
    }

    const session = requireSession(caller.id, mailbox)
    if (!session) {
      return reply.code(401).send({ success: false, error: 'No active webmail session' })
    }

    try {
      // First get current flag state
      const getResponse = await jmapRequest(session.email, session.password, [
        [
          'Email/get',
          {
            accountId: session.accountId,
            ids: [id],
            properties: ['keywords'],
          },
          '0',
        ],
      ])

      const emails = getResponse.methodResponses?.[0]?.[1]?.list ?? []
      if (emails.length === 0) {
        return reply.code(404).send({ success: false, error: 'Message not found' })
      }

      const isFlagged = !!(emails[0].keywords?.['$flagged'])

      // Toggle the flag
      await jmapRequest(session.email, session.password, [
        [
          'Email/set',
          {
            accountId: session.accountId,
            update: {
              [id]: { 'keywords/$flagged': isFlagged ? null : true },
            },
          },
          '0',
        ],
      ])

      return reply.send({ success: true, data: { isFlagged: !isFlagged } })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to toggle flag',
      })
    }
  })

  // ── POST /messages/:id/move — move message to another folder ──────────────

  fastify.post('/messages/:id/move', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const { id } = request.params as { id: string }
    const body = moveSchema.safeParse(request.body)

    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const { mailbox, folderId } = body.data

    const session = requireSession(caller.id, mailbox)
    if (!session) {
      return reply.code(401).send({ success: false, error: 'No active webmail session' })
    }

    try {
      await jmapRequest(session.email, session.password, [
        [
          'Email/set',
          {
            accountId: session.accountId,
            update: {
              [id]: { mailboxIds: { [folderId]: true } },
            },
          },
          '0',
        ],
      ])

      return reply.send({ success: true })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to move message',
      })
    }
  })

  // ── DELETE /messages/:id?mailbox=X — delete or move to trash ──────────────

  fastify.delete('/messages/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const { id } = request.params as { id: string }
    const { mailbox } = request.query as { mailbox?: string }

    if (!mailbox) {
      return reply.code(400).send({ success: false, error: 'mailbox query parameter is required' })
    }

    const session = requireSession(caller.id, mailbox)
    if (!session) {
      return reply.code(401).send({ success: false, error: 'No active webmail session' })
    }

    try {
      // Get the Trash folder ID
      const foldersResponse = await jmapRequest(session.email, session.password, [
        [
          'Mailbox/get',
          {
            accountId: session.accountId,
            properties: ['id', 'role'],
          },
          '0',
        ],
      ])

      const folders = foldersResponse.methodResponses?.[0]?.[1]?.list ?? []
      const trashFolder = folders.find((f: any) => f.role === 'trash')

      if (!trashFolder) {
        // No trash folder found — permanently delete
        await jmapRequest(session.email, session.password, [
          [
            'Email/set',
            {
              accountId: session.accountId,
              destroy: [id],
            },
            '0',
          ],
        ])

        return reply.send({ success: true, data: { action: 'deleted' } })
      }

      // Check if message is already in Trash
      const msgResponse = await jmapRequest(session.email, session.password, [
        [
          'Email/get',
          {
            accountId: session.accountId,
            ids: [id],
            properties: ['mailboxIds'],
          },
          '0',
        ],
      ])

      const emails = msgResponse.methodResponses?.[0]?.[1]?.list ?? []
      if (emails.length === 0) {
        return reply.code(404).send({ success: false, error: 'Message not found' })
      }

      const mailboxIds = emails[0].mailboxIds ?? {}
      const isInTrash = !!(mailboxIds[trashFolder.id])

      if (isInTrash) {
        // Permanently delete
        await jmapRequest(session.email, session.password, [
          [
            'Email/set',
            {
              accountId: session.accountId,
              destroy: [id],
            },
            '0',
          ],
        ])

        return reply.send({ success: true, data: { action: 'deleted' } })
      }

      // Move to Trash
      await jmapRequest(session.email, session.password, [
        [
          'Email/set',
          {
            accountId: session.accountId,
            update: {
              [id]: { mailboxIds: { [trashFolder.id]: true } },
            },
          },
          '0',
        ],
      ])

      return reply.send({ success: true, data: { action: 'trashed' } })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to delete message',
      })
    }
  })

  // ── POST /send — compose and send an email ────────────────────────────────

  fastify.post('/send', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = sendSchema.safeParse(request.body)

    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const {
      mailbox, to, cc, bcc, subject, htmlBody, textBody,
      inReplyTo, references, attachmentBlobIds,
    } = body.data

    const session = requireSession(caller.id, mailbox)
    if (!session) {
      return reply.code(401).send({ success: false, error: 'No active webmail session' })
    }

    try {
      // Build email body parts
      const bodyParts: any[] = []
      const bodyValues: Record<string, any> = {}

      if (textBody) {
        bodyParts.push({ partId: 'text', type: 'text/plain' })
        bodyValues['text'] = { value: textBody }
      }

      bodyParts.push({ partId: 'html', type: 'text/html' })
      bodyValues['html'] = { value: htmlBody }

      // Build attachments
      const attachments = (attachmentBlobIds ?? []).map((blobId) => ({
        blobId,
        type: 'application/octet-stream',
        disposition: 'attachment',
      }))

      // Build the email create object
      const emailCreate: Record<string, any> = {
        from: [{ email: session.email }],
        to: to.map(formatAddress),
        subject,
        bodyStructure: bodyParts.length === 1
          ? bodyParts[0]
          : { type: 'multipart/alternative', subParts: bodyParts },
        bodyValues,
        keywords: { $seen: true },
        mailboxIds: {},
      }

      if (cc && cc.length > 0) emailCreate.cc = cc.map(formatAddress)
      if (bcc && bcc.length > 0) emailCreate.bcc = bcc.map(formatAddress)
      if (inReplyTo) emailCreate.inReplyTo = [inReplyTo]
      if (references) emailCreate.references = references.split(/\s+/)
      if (attachments.length > 0) emailCreate.attachments = attachments

      // Get Drafts folder to create the email in
      const foldersResponse = await jmapRequest(session.email, session.password, [
        [
          'Mailbox/get',
          {
            accountId: session.accountId,
            properties: ['id', 'role'],
          },
          '0',
        ],
      ])

      const folders = foldersResponse.methodResponses?.[0]?.[1]?.list ?? []
      const draftsFolder = folders.find((f: any) => f.role === 'drafts')
      const sentFolder = folders.find((f: any) => f.role === 'sent')

      if (draftsFolder) {
        emailCreate.mailboxIds[draftsFolder.id] = true
      }

      // Create email + submit in one batch
      const sendResponse = await jmapRequest(session.email, session.password, [
        [
          'Email/set',
          {
            accountId: session.accountId,
            create: { draft: emailCreate },
          },
          '0',
        ],
        [
          'EmailSubmission/set',
          {
            accountId: session.accountId,
            create: {
              send: {
                emailId: '#draft',
                envelope: undefined,
              },
            },
            onSuccessUpdateEmail: {
              '#send': {
                mailboxIds: sentFolder
                  ? { [sentFolder.id]: true }
                  : undefined,
                'keywords/$draft': null,
              },
            },
          },
          '1',
        ],
      ])

      // Check for errors
      const emailSetResult = sendResponse.methodResponses?.[0]?.[1] ?? {}
      const submissionResult = sendResponse.methodResponses?.[1]?.[1] ?? {}

      if (emailSetResult.notCreated?.draft) {
        const err = emailSetResult.notCreated.draft
        return reply.code(500).send({
          success: false,
          error: `Failed to create email: ${err.description || JSON.stringify(err)}`,
        })
      }

      if (submissionResult.notCreated?.send) {
        const err = submissionResult.notCreated.send
        return reply.code(500).send({
          success: false,
          error: `Failed to send email: ${err.description || JSON.stringify(err)}`,
        })
      }

      return reply.send({ success: true, data: { sent: true } })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Failed to send message',
      })
    }
  })

  // ── POST /search — search messages via JMAP ───────────────────────────────

  fastify.post('/search', { preHandler: [authMiddleware] }, async (request, reply) => {
    const caller = getRequestUser(request)
    const body = searchSchema.safeParse(request.body)

    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: body.error.errors[0]?.message ?? 'Invalid input',
      })
    }

    const { mailbox, query, folderId } = body.data

    const session = requireSession(caller.id, mailbox)
    if (!session) {
      return reply.code(401).send({ success: false, error: 'No active webmail session' })
    }

    try {
      const filter: Record<string, any> = { text: query }
      if (folderId) {
        filter.inMailbox = folderId
      }

      const response = await jmapRequest(session.email, session.password, [
        [
          'Email/query',
          {
            accountId: session.accountId,
            filter,
            sort: [{ property: 'receivedAt', isAscending: false }],
            limit: 50,
            calculateTotal: true,
          },
          '0',
        ],
        [
          'Email/get',
          {
            accountId: session.accountId,
            '#ids': { resultOf: '0', name: 'Email/query', path: '/ids' },
            properties: [
              'id', 'from', 'to', 'subject', 'receivedAt', 'preview',
              'keywords', 'hasAttachment', 'size',
            ],
          },
          '1',
        ],
      ])

      const queryResult = response.methodResponses?.[0]?.[1] ?? {}
      const getResult = response.methodResponses?.[1]?.[1] ?? {}
      const total = queryResult.total ?? 0
      const emails = getResult.list ?? []

      const messages = emails.map((e: any) => ({
        id: e.id,
        from: e.from ?? [],
        to: e.to ?? [],
        subject: e.subject ?? '(no subject)',
        receivedAt: e.receivedAt,
        preview: e.preview ?? '',
        isRead: !!(e.keywords?.['$seen']),
        isFlagged: !!(e.keywords?.['$flagged']),
        hasAttachment: e.hasAttachment ?? false,
        size: e.size ?? 0,
      }))

      return reply.send({ success: true, data: { messages, total } })
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message ?? 'Search failed',
      })
    }
  })
}
