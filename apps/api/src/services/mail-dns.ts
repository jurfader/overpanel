/**
 * Mail DNS configuration via Cloudflare
 * Creates MX, SPF, DKIM, and DMARC records for mail domains.
 */

import {
  findZoneForDomain,
  createDnsRecord,
  listDnsRecords,
  deleteDnsRecord,
} from './cloudflare.js'

// ── Configure all mail DNS records ───────────────────────────────────────────

export async function configureMailDns(
  domain: string,
  serverIp: string,
  dkimPublicKey: string,
  cfToken: string
): Promise<{ mx: boolean; spf: boolean; dkim: boolean; dmarc: boolean }> {
  const zone = await findZoneForDomain(cfToken, domain)
  if (!zone) {
    throw new Error(`No Cloudflare zone found for domain: ${domain}`)
  }

  const result = { mx: false, spf: false, dkim: false, dmarc: false }

  // MX record: domain -> mail.domain (priority 10)
  try {
    await createDnsRecord(cfToken, zone.id, {
      type: 'MX',
      name: domain,
      content: `mail.${domain}`,
      ttl: 3600,
      proxied: false,
    } as any) // MX records use priority field handled by CF API
    result.mx = true
  } catch (err: any) {
    console.error(`[Mail DNS] Failed to create MX record for ${domain}:`, err.message)
  }

  // A record: mail.domain -> server IP (MUST NOT be proxied!)
  try {
    await createDnsRecord(cfToken, zone.id, {
      type: 'A',
      name: `mail.${domain}`,
      content: serverIp,
      ttl: 3600,
      proxied: false,
    })
    result.mx = result.mx // keep existing status
  } catch (err: any) {
    console.error(`[Mail DNS] Failed to create A record for mail.${domain}:`, err.message)
  }

  // SPF TXT record
  try {
    await createDnsRecord(cfToken, zone.id, {
      type: 'TXT',
      name: domain,
      content: `v=spf1 a mx ip4:${serverIp} ~all`,
      ttl: 3600,
      proxied: false,
    })
    result.spf = true
  } catch (err: any) {
    console.error(`[Mail DNS] Failed to create SPF record for ${domain}:`, err.message)
  }

  // DKIM TXT record
  try {
    if (dkimPublicKey) {
      await createDnsRecord(cfToken, zone.id, {
        type: 'TXT',
        name: `overpanel._domainkey.${domain}`,
        content: dkimPublicKey,
        ttl: 3600,
        proxied: false,
      })
      result.dkim = true
    }
  } catch (err: any) {
    console.error(`[Mail DNS] Failed to create DKIM record for ${domain}:`, err.message)
  }

  // DMARC TXT record
  try {
    await createDnsRecord(cfToken, zone.id, {
      type: 'TXT',
      name: `_dmarc.${domain}`,
      content: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}`,
      ttl: 3600,
      proxied: false,
    })
    result.dmarc = true
  } catch (err: any) {
    console.error(`[Mail DNS] Failed to create DMARC record for ${domain}:`, err.message)
  }

  return result
}

// ── Remove all mail DNS records ──────────────────────────────────────────────

export async function removeMailDns(
  domain: string,
  cfToken: string
): Promise<void> {
  const zone = await findZoneForDomain(cfToken, domain)
  if (!zone) return

  const records = await listDnsRecords(cfToken, zone.id)

  // Identify mail-related records
  const mailRecords = records.filter((r) => {
    // MX records for the domain
    if (r.type === 'MX' && r.name === domain) return true
    // A record for mail.domain
    if (r.type === 'A' && r.name === `mail.${domain}`) return true
    // SPF (TXT with v=spf1) for the domain
    if (r.type === 'TXT' && r.name === domain && r.content.startsWith('v=spf1')) return true
    // DKIM record
    if (r.type === 'TXT' && r.name === `overpanel._domainkey.${domain}`) return true
    // DMARC record
    if (r.type === 'TXT' && r.name === `_dmarc.${domain}`) return true
    return false
  })

  for (const record of mailRecords) {
    try {
      await deleteDnsRecord(cfToken, zone.id, record.id)
    } catch (err: any) {
      console.error(`[Mail DNS] Failed to delete record ${record.id}:`, err.message)
    }
  }
}

// ── Check DNS status ─────────────────────────────────────────────────────────

export async function checkMailDnsStatus(
  domain: string,
  cfToken: string
): Promise<{ mx: boolean; spf: boolean; dkim: boolean; dmarc: boolean }> {
  const zone = await findZoneForDomain(cfToken, domain)
  if (!zone) {
    return { mx: false, spf: false, dkim: false, dmarc: false }
  }

  const records = await listDnsRecords(cfToken, zone.id)

  const mx = records.some((r) => r.type === 'MX' && r.name === domain)
  const spf = records.some(
    (r) => r.type === 'TXT' && r.name === domain && r.content.startsWith('v=spf1')
  )
  const dkim = records.some(
    (r) => r.type === 'TXT' && r.name === `overpanel._domainkey.${domain}`
  )
  const dmarc = records.some(
    (r) => r.type === 'TXT' && r.name === `_dmarc.${domain}`
  )

  return { mx, spf, dkim, dmarc }
}
