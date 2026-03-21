import { createHmac, createHash } from 'crypto'
import { readFileSync } from 'fs'
import { basename } from 'path'
import { prisma } from '@overpanel/db'

interface S3Config {
  endpoint: string
  bucket: string
  accessKey: string
  secretKey: string
  region: string
}

async function getS3Config(): Promise<S3Config | null> {
  const keys = ['s3_endpoint', 's3_bucket', 's3_access_key', 's3_secret_key', 's3_region']
  const settings = await prisma.setting.findMany({ where: { key: { in: keys } } })
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]))

  if (!map.s3_endpoint || !map.s3_bucket || !map.s3_access_key || !map.s3_secret_key) {
    return null
  }

  return {
    endpoint: map.s3_endpoint,
    bucket: map.s3_bucket,
    accessKey: map.s3_access_key,
    secretKey: map.s3_secret_key,
    region: map.s3_region || 'us-east-1',
  }
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export async function uploadBackupToS3(filePath: string): Promise<string | null> {
  const config = await getS3Config()
  if (!config) return null

  const { run } = await import('./shell.js')

  // Use aws CLI if available (simplest approach)
  const awsCheck = await run('which aws 2>/dev/null || echo ""').catch(() => ({ stdout: '' }))

  if (awsCheck.stdout.trim()) {
    // Use aws CLI
    const fileName = basename(filePath)
    const s3Url = `s3://${config.bucket}/overpanel-backups/${fileName}`

    const env = [
      `AWS_ACCESS_KEY_ID=${JSON.stringify(config.accessKey)}`,
      `AWS_SECRET_ACCESS_KEY=${JSON.stringify(config.secretKey)}`,
      `AWS_DEFAULT_REGION=${config.region}`,
    ].join(' ')

    const endpoint =
      config.endpoint !== 's3.amazonaws.com'
        ? `--endpoint-url ${JSON.stringify(config.endpoint)}`
        : ''

    await run(
      `${env} aws s3 cp ${JSON.stringify(filePath)} ${JSON.stringify(s3Url)} ${endpoint}`
    )
    return s3Url
  }

  // Fallback: use curl with AWS Sig v4
  const fileName = basename(filePath)
  const now = new Date()
  // Format: YYYYMMDDTHHmmssZ
  const dateISO =
    now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dateShort = dateISO.slice(0, 8) // YYYYMMDD

  const fileContent = readFileSync(filePath)
  const contentHash = sha256Hex(fileContent)
  const objectKey = `overpanel-backups/${fileName}`

  const endpointUrl = config.endpoint.startsWith('http')
    ? config.endpoint
    : `https://${config.endpoint}`

  const host = new URL(endpointUrl).host

  const headers: Record<string, string> = {
    'host': host,
    'x-amz-content-sha256': contentHash,
    'x-amz-date': dateISO,
  }

  const sortedHeaderKeys = Object.keys(headers).sort()
  const signedHeaders = sortedHeaderKeys.join(';')
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('')

  const canonicalRequest = [
    'PUT',
    `/${objectKey}`,
    '',
    canonicalHeaders,
    signedHeaders,
    contentHash,
  ].join('\n')

  const scope = `${dateShort}/${config.region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateISO,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = hmacSha256(
    hmacSha256(
      hmacSha256(
        hmacSha256(`AWS4${config.secretKey}`, dateShort),
        config.region
      ),
      's3'
    ),
    'aws4_request'
  )

  const signature = hmacSha256(signingKey, stringToSign).toString('hex')
  const authHeader = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const uploadUrl = `${endpointUrl}/${config.bucket}/${objectKey}`

  const curlCmd = [
    'curl', '-s', '-X', 'PUT',
    '-H', JSON.stringify(`Authorization: ${authHeader}`),
    '-H', JSON.stringify(`x-amz-date: ${dateISO}`),
    '-H', JSON.stringify(`x-amz-content-sha256: ${contentHash}`),
    '--data-binary', `@${JSON.stringify(filePath)}`,
    JSON.stringify(uploadUrl),
  ].join(' ')

  await run(curlCmd)
  return uploadUrl
}

export async function isS3Configured(): Promise<boolean> {
  const config = await getS3Config()
  return config !== null
}
