/**
 * In-memory session store for webmail connections.
 * Each session holds JMAP credentials + session info for a user/mailbox pair.
 * Sessions expire after 30 minutes of inactivity.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface WebmailSession {
  email: string
  password: string
  accountId: string
  apiUrl: string
  downloadUrl: string
  uploadUrl: string
  lastUsed: number
}

// ── Session store ───────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

const sessions = new Map<string, WebmailSession>()

function sessionKey(userId: string, mailbox: string): string {
  return `${userId}:${mailbox}`
}

export function createSession(userId: string, mailbox: string, session: WebmailSession): void {
  session.lastUsed = Date.now()
  sessions.set(sessionKey(userId, mailbox), session)
}

export function getSession(userId: string, mailbox: string): WebmailSession | null {
  const key = sessionKey(userId, mailbox)
  const session = sessions.get(key)
  if (!session) return null

  // Check expiry
  if (Date.now() - session.lastUsed > SESSION_TTL_MS) {
    sessions.delete(key)
    return null
  }

  // Touch — update lastUsed
  session.lastUsed = Date.now()
  return session
}

export function destroySession(userId: string, mailbox: string): void {
  sessions.delete(sessionKey(userId, mailbox))
}

export function cleanupExpired(): void {
  const now = Date.now()
  for (const [key, session] of sessions) {
    if (now - session.lastUsed > SESSION_TTL_MS) {
      sessions.delete(key)
    }
  }
}

// ── Auto-cleanup timer ──────────────────────────────────────────────────────

const cleanupTimer = setInterval(cleanupExpired, CLEANUP_INTERVAL_MS)
cleanupTimer.unref()
