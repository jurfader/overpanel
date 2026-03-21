/**
 * Cloudflare API wrapper
 * Obsługuje: DNS records, Origin Certificates, Zone lookup
 */

const CF_API = 'https://api.cloudflare.com/client/v4'

export class CloudflareError extends Error {
  constructor(message: string, public errors?: unknown[]) {
    super(message)
    this.name = 'CloudflareError'
  }
}

async function cfFetch<T>(
  token: string,
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const json = await res.json() as { success: boolean; result: T; errors: unknown[] }

  if (!json.success) {
    throw new CloudflareError(
      `Cloudflare API error on ${path}`,
      json.errors
    )
  }

  return json.result
}

// ── Zone ──────────────────────────────────────────────────────────────────────

export interface CfZone {
  id: string
  name: string
  status: string
  plan: { name: string }
}

/** Pobierz wszystkie strefy dostępne dla tokenu */
export async function listZones(token: string): Promise<CfZone[]> {
  return cfFetch<CfZone[]>(token, '/zones?per_page=50')
}

/** Znajdź strefę dla domeny (lub jej domeny nadrzędnej) */
export async function findZoneForDomain(
  token: string,
  domain: string
): Promise<CfZone | null> {
  const zones = await listZones(token)
  // Najpierw dokładne dopasowanie, potem domena nadrzędna
  const parts = domain.split('.')
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.')
    const found = zones.find((z) => z.name === candidate)
    if (found) return found
  }
  return null
}

// ── DNS Records ───────────────────────────────────────────────────────────────

export interface CfDnsRecord {
  id: string
  type: string
  name: string
  content: string
  ttl: number
  proxied: boolean
  comment?: string
  modified_on: string
}

export async function listDnsRecords(token: string, zoneId: string): Promise<CfDnsRecord[]> {
  return cfFetch<CfDnsRecord[]>(token, `/zones/${zoneId}/dns_records?per_page=100`)
}

export async function createDnsRecord(
  token: string,
  zoneId: string,
  record: Pick<CfDnsRecord, 'type' | 'name' | 'content' | 'ttl' | 'proxied'>
): Promise<CfDnsRecord> {
  return cfFetch<CfDnsRecord>(token, `/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(record),
  })
}

export async function updateDnsRecord(
  token: string,
  zoneId: string,
  recordId: string,
  record: Partial<Pick<CfDnsRecord, 'type' | 'name' | 'content' | 'ttl' | 'proxied'>>
): Promise<CfDnsRecord> {
  return cfFetch<CfDnsRecord>(token, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(record),
  })
}

export async function replaceDnsRecord(
  token: string,
  zoneId: string,
  recordId: string,
  record: Pick<CfDnsRecord, 'type' | 'name' | 'content' | 'ttl' | 'proxied'>
): Promise<CfDnsRecord> {
  return cfFetch<CfDnsRecord>(token, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify(record),
  })
}

export async function deleteDnsRecord(
  token: string,
  zoneId: string,
  recordId: string
): Promise<void> {
  await cfFetch(token, `/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' })
}

// ── Origin Certificates ───────────────────────────────────────────────────────

export interface CfOriginCert {
  id: string
  certificate: string
  private_key: string
  hostnames: string[]
  expires_on: string
  request_type: string
}

/**
 * Wygeneruj Cloudflare Origin Certificate (ważny 15 lat)
 * Nginx ufa temu certyfikatowi gdy ruch przychodzi przez Cloudflare proxy.
 */
export async function createOriginCertificate(
  token: string,
  domain: string,
  validityDays = 5475 // 15 lat
): Promise<CfOriginCert> {
  return cfFetch<CfOriginCert>(token, '/certificates', {
    method: 'POST',
    body: JSON.stringify({
      hostnames: [domain, `*.${domain}`],
      request_type: 'origin-rsa',
      requested_validity: validityDays,
    }),
  })
}

export async function revokeOriginCertificate(
  token: string,
  certId: string
): Promise<void> {
  await cfFetch(token, `/certificates/${certId}`, { method: 'DELETE' })
}

// ── Server IP ─────────────────────────────────────────────────────────────────

/** Pobierz publiczne IP serwera (do auto-dodania rekordu A) */
export async function getPublicIp(): Promise<string> {
  const res = await fetch('https://api.ipify.org?format=json')
  const json = await res.json() as { ip: string }
  return json.ip
}
