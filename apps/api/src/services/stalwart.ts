/**
 * Stalwart Mail Server REST API wrapper (v0.15+)
 * Uses /api/principal endpoint with Basic Auth.
 * Supports both local and remote Stalwart instances (e.g. mail VPS).
 */

import { prisma } from '@overpanel/db'

// ── Config helper ────────────────────────────────────────────────────────────

async function getStalwartConfig(): Promise<{ url: string; user: string; password: string }> {
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['mail_stalwart_url', 'mail_stalwart_token'] } },
  })
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  const url = map['mail_stalwart_url'] || process.env.STALWART_API_URL || 'https://localhost'
  const password = map['mail_stalwart_token']
  if (!password) throw new Error('Stalwart admin password not configured (mail_stalwart_token)')

  return { url: url.replace(/\/$/, ''), user: 'admin', password }
}

// Use curl for HTTPS with self-signed certs (Node fetch rejects them)
async function stalwartApi(path: string, method = 'GET', body?: unknown): Promise<any> {
  const { url, user, password } = await getStalwartConfig()
  const auth = Buffer.from(`${user}:${password}`).toString('base64')
  const { run } = await import('./shell.js')

  const parts = [
    'curl', '-sk',
    '-X', method,
    '-H', `"Authorization: Basic ${auth}"`,
    '-H', '"Accept: application/json"',
  ]

  if (body !== undefined) {
    parts.push('-H', '"Content-Type: application/json"')
    parts.push('-d', JSON.stringify(JSON.stringify(body)))
  }

  parts.push(`"${url}${path}"`)

  const result = await run(parts.join(' '))
  const text = result.stdout.trim()
  if (!text) return null

  try {
    const json = JSON.parse(text)
    if (json.type === 'about:blank' && json.status >= 400) {
      throw new Error(`Stalwart API ${method} ${path}: ${json.detail || json.title}`)
    }
    return json.data ?? json
  } catch (e) {
    if (e instanceof SyntaxError) return text
    throw e
  }
}

// ── Status ───────────────────────────────────────────────────────────────────

export async function isStalwartRunning(): Promise<boolean> {
  try {
    const result = await stalwartApi('/api/principal?type=domain&limit=1')
    return result !== null && typeof result === 'object'
  } catch {
    return false
  }
}

// ── Domains ──────────────────────────────────────────────────────────────────

export async function createStalwartDomain(domain: string): Promise<void> {
  await stalwartApi('/api/principal', 'POST', {
    type: 'domain',
    name: domain,
  })
}

export async function deleteStalwartDomain(domain: string): Promise<void> {
  // First find domain ID
  const list = await stalwartApi('/api/principal?type=domain')
  const items = list?.items ?? []
  const found = items.find((d: any) => d.name === domain)
  if (found) {
    await stalwartApi(`/api/principal/${found.name}`, 'DELETE')
  }
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export async function createStalwartAccount(
  email: string,
  password: string,
  displayName: string,
  quotaMb: number
): Promise<void> {
  await stalwartApi('/api/principal', 'POST', {
    type: 'individual',
    name: email,
    emails: [email],
    secrets: [password],
    quota: quotaMb * 1024 * 1024,
    description: displayName || email,
    roles: ['user'],
  })
}

export async function updateStalwartPassword(
  email: string,
  newPassword: string
): Promise<void> {
  await stalwartApi(`/api/principal/${encodeURIComponent(email)}`, 'PATCH', [
    { action: 'set', field: 'secrets', value: [newPassword] },
  ])
}

export async function deleteStalwartAccount(email: string): Promise<void> {
  await stalwartApi(`/api/principal/${encodeURIComponent(email)}`, 'DELETE')
}

// ── DKIM ─────────────────────────────────────────────────────────────────────

export async function getStalwartDkimPublicKey(
  domain: string
): Promise<string | null> {
  try {
    const result = await stalwartApi(`/api/dkim/${encodeURIComponent(domain)}`)
    return result?.publicKey ?? null
  } catch {
    return null
  }
}
