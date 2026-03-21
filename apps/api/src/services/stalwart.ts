/**
 * Stalwart Mail Server REST API wrapper
 * Manages domains, accounts, and DKIM via the Stalwart management API.
 */

import { prisma } from '@overpanel/db'

const STALWART_API_URL = process.env.STALWART_API_URL || 'http://localhost:8461'

// ── Auth helper ──────────────────────────────────────────────────────────────

async function getStalwartToken(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: 'mail_stalwart_token' } })
  if (!row?.value) {
    throw new Error('Stalwart API token not configured (mail_stalwart_token)')
  }
  return row.value
}

async function stalwartFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const token = await getStalwartToken()
  const res = await fetch(`${STALWART_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Stalwart API error ${res.status} on ${path}: ${text}`)
  }

  return res
}

// ── Status ───────────────────────────────────────────────────────────────────

export async function isStalwartRunning(): Promise<boolean> {
  try {
    const token = await getStalwartToken()
    const res = await fetch(`${STALWART_API_URL}/api/domain`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok
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
