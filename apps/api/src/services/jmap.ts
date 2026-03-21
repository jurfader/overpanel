/**
 * JMAP client for Stalwart Mail Server.
 * Uses curl -sk with Basic Auth (same approach as stalwart.ts).
 */

import { prisma } from '@overpanel/db'

// ── Types ───────────────────────────────────────────────────────────────────

export interface JmapSessionInfo {
  accountId: string
  apiUrl: string
  uploadUrl: string
  downloadUrl: string
}

// ── Config helper ───────────────────────────────────────────────────────────

async function getStalwartUrl(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: 'mail_stalwart_url' } })
  const url = row?.value || process.env.STALWART_API_URL || 'https://localhost'
  return url.replace(/\/$/, '')
}

function basicAuth(email: string, password: string): string {
  return Buffer.from(`${email}:${password}`).toString('base64')
}

// ── JMAP Session ────────────────────────────────────────────────────────────

export async function jmapSession(email: string, password: string): Promise<JmapSessionInfo> {
  const baseUrl = await getStalwartUrl()
  const auth = basicAuth(email, password)
  const { run } = await import('./shell.js')

  const cmd = [
    'curl', '-sk',
    '-X', 'GET',
    '-H', `"Authorization: Basic ${auth}"`,
    '-H', '"Accept: application/json"',
    `"${baseUrl}/.well-known/jmap"`,
  ].join(' ')

  const result = await run(cmd)
  const text = result.stdout.trim()

  if (!text) {
    throw new Error('JMAP session: empty response from Stalwart')
  }

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`JMAP session: invalid JSON response: ${text.slice(0, 200)}`)
  }

  if (json.type === 'about:blank' && json.status >= 400) {
    throw new Error(`JMAP session failed: ${json.detail || json.title || 'Unknown error'}`)
  }

  if (!json.accounts || !json.apiUrl) {
    throw new Error('JMAP session: unexpected response structure')
  }

  // Extract the primary account ID
  const primaryAccounts = json.primaryAccounts || {}
  const accountId =
    primaryAccounts['urn:ietf:params:jmap:mail'] ||
    Object.keys(json.accounts)[0]

  if (!accountId) {
    throw new Error('JMAP session: no account found')
  }

  return {
    accountId,
    apiUrl: json.apiUrl,
    uploadUrl: json.uploadUrl,
    downloadUrl: json.downloadUrl,
  }
}

// ── JMAP Request ────────────────────────────────────────────────────────────

export async function jmapRequest(
  email: string,
  password: string,
  methodCalls: any[]
): Promise<any> {
  const baseUrl = await getStalwartUrl()
  const auth = basicAuth(email, password)
  const { run } = await import('./shell.js')

  const payload = {
    using: [
      'urn:ietf:params:jmap:core',
      'urn:ietf:params:jmap:mail',
      'urn:ietf:params:jmap:submission',
    ],
    methodCalls,
  }

  const cmd = [
    'curl', '-sk',
    '-X', 'POST',
    '-H', `"Authorization: Basic ${auth}"`,
    '-H', '"Content-Type: application/json"',
    '-d', JSON.stringify(JSON.stringify(payload)),
    `"${baseUrl}/jmap"`,
  ].join(' ')

  const result = await run(cmd)
  const text = result.stdout.trim()

  if (!text) {
    throw new Error('JMAP request: empty response')
  }

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`JMAP request: invalid JSON response: ${text.slice(0, 200)}`)
  }

  if (json.type === 'about:blank' && json.status >= 400) {
    throw new Error(`JMAP request failed: ${json.detail || json.title || 'Unknown error'}`)
  }

  return json
}

// ── JMAP Upload ─────────────────────────────────────────────────────────────

export async function jmapUpload(
  email: string,
  password: string,
  accountId: string,
  filePath: string,
  contentType: string
): Promise<{ blobId: string; size: number; type: string }> {
  const baseUrl = await getStalwartUrl()
  const auth = basicAuth(email, password)
  const { run } = await import('./shell.js')

  // Build upload URL from the session template
  const uploadUrl = `${baseUrl}/jmap/upload/${accountId}/`

  const cmd = [
    'curl', '-sk',
    '-X', 'POST',
    '-H', `"Authorization: Basic ${auth}"`,
    '-H', `"Content-Type: ${contentType}"`,
    '--data-binary', `@${filePath}`,
    `"${uploadUrl}"`,
  ].join(' ')

  const result = await run(cmd)
  const text = result.stdout.trim()

  if (!text) {
    throw new Error('JMAP upload: empty response')
  }

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`JMAP upload: invalid JSON response: ${text.slice(0, 200)}`)
  }

  return {
    blobId: json.blobId,
    size: json.size,
    type: json.type,
  }
}

// ── JMAP Download URL ───────────────────────────────────────────────────────

export function jmapDownloadUrl(accountId: string, blobId: string, name: string): string {
  // This returns a relative path; the caller should prepend the base URL if needed.
  return `/jmap/download/${accountId}/${blobId}/${encodeURIComponent(name)}`
}
