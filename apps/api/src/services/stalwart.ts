/**
 * Stalwart Mail Server REST API wrapper
 * Manages domains, accounts, and DKIM via the Stalwart management API.
 * Supports both local and remote Stalwart instances (e.g. mail VPS).
 */

import { prisma } from '@overpanel/db'

// ── Config helper ────────────────────────────────────────────────────────────

async function getStalwartConfig(): Promise<{ url: string; user: string; password: string }> {
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['mail_stalwart_url', 'mail_stalwart_token'] } },
  })
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  const url = map['mail_stalwart_url'] || process.env.STALWART_API_URL || 'https://localhost:443'
  const password = map['mail_stalwart_token']
  if (!password) throw new Error('Stalwart admin password not configured (mail_stalwart_token)')

  return { url: url.replace(/\/$/, ''), user: 'admin', password }
}

async function stalwartFetch(path: string, options?: RequestInit): Promise<Response> {
  const { url, user, password } = await getStalwartConfig()
  const auth = Buffer.from(`${user}:${password}`).toString('base64')

  // Use shell curl for HTTPS with self-signed certs (fetch rejects them)
  const { run } = await import('./shell.js')

  const method = options?.method ?? 'GET'
  const body = options?.body ? `-d ${JSON.stringify(String(options.body))}` : ''
  const contentType = options?.body ? `-H "Content-Type: application/json"` : ''

  const cmd = `curl -sk -X ${method} -H "Authorization: Basic ${auth}" ${contentType} ${body} "${url}${path}"`
  const result = await run(cmd)

  // Parse response
  const text = result.stdout.trim()
  if (text.includes('"status":4') || text.includes('"status":5')) {
    throw new Error(`Stalwart API error on ${path}: ${text}`)
  }

  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } })
}

// ── Status ───────────────────────────────────────────────────────────────────

export async function isStalwartRunning(): Promise<boolean> {
  try {
    const { url, user, password } = await getStalwartConfig()
    const auth = Buffer.from(`${user}:${password}`).toString('base64')
    const { run } = await import('./shell.js')
    const result = await run(`curl -sk -o /dev/null -w "%{http_code}" -H "Authorization: Basic ${auth}" "${url}/api/domain"`)
    return result.stdout.trim() === '200'
  } catch {
    return false
  }
}

// ── Domains ──────────────────────────────────────────────────────────────────

export async function createStalwartDomain(domain: string): Promise<void> {
  await stalwartFetch(`/api/domain/${encodeURIComponent(domain)}`, {
    method: 'POST',
  })
}

export async function deleteStalwartDomain(domain: string): Promise<void> {
  await stalwartFetch(`/api/domain/${encodeURIComponent(domain)}`, {
    method: 'DELETE',
  })
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export async function createStalwartAccount(
  email: string,
  password: string,
  displayName: string,
  quotaMb: number
): Promise<void> {
  await stalwartFetch('/api/account', {
    method: 'POST',
    body: JSON.stringify({
      name: email,
      type: 'individual',
      emails: [email],
      secrets: [password],
      quota: quotaMb * 1024 * 1024, // bytes
      description: displayName,
    }),
  })
}

export async function updateStalwartPassword(
  email: string,
  newPassword: string
): Promise<void> {
  await stalwartFetch(`/api/account/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      secrets: [newPassword],
    }),
  })
}

export async function deleteStalwartAccount(email: string): Promise<void> {
  await stalwartFetch(`/api/account/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  })
}

// ── DKIM ─────────────────────────────────────────────────────────────────────

export async function getStalwartDkimPublicKey(
  domain: string
): Promise<string | null> {
  try {
    const res = await stalwartFetch(
      `/api/domain/${encodeURIComponent(domain)}/dkim`,
      { method: 'GET' }
    )
    const data = await res.json() as { data?: { publicKey?: string } }
    return data?.data?.publicKey ?? null
  } catch {
    return null
  }
}
