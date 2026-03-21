import path from 'path'
import { createSign } from 'crypto'
import { prisma } from '@overpanel/db'
import { run } from './shell.js'
import { uploadBackupToS3, isS3Configured } from './s3.js'

// ── Types ────────────────────────────────────────────────────────────────────

export type BackupProvider = 's3' | 'sftp' | 'gdrive' | 'dropbox' | 'local'

export interface BackupUploadResult {
  provider: BackupProvider
  success: boolean
  url?: string
  error?: string
}

export interface SftpConfig {
  host: string
  port: number
  username: string
  password?: string
  keyPath?: string
  remotePath: string
}

export interface GDriveConfig {
  serviceAccountJson: string
  folderId: string
}

export interface DropboxConfig {
  accessToken: string
  remotePath: string
}

// ── Helper: read settings map ────────────────────────────────────────────────

async function getSettingsMap(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ── SFTP provider ────────────────────────────────────────────────────────────

async function getSftpConfig(): Promise<SftpConfig | null> {
  const keys = ['sftp_host', 'sftp_port', 'sftp_username', 'sftp_password', 'sftp_key_path', 'sftp_remote_path']
  const m = await getSettingsMap(keys)
  if (!m.sftp_host || !m.sftp_username) return null
  return {
    host: m.sftp_host,
    port: parseInt(m.sftp_port || '22', 10),
    username: m.sftp_username,
    password: m.sftp_password,
    keyPath: m.sftp_key_path,
    remotePath: m.sftp_remote_path || '/backups',
  }
}

export async function uploadToSftp(filePath: string, config: SftpConfig): Promise<string> {
  const fileName = path.basename(filePath)
  const remoteDest = `${config.remotePath}/${fileName}`

  if (config.keyPath) {
    // Key-based auth
    await run(
      `scp -i ${JSON.stringify(config.keyPath)} -P ${config.port} -o StrictHostKeyChecking=no -o BatchMode=yes ${JSON.stringify(filePath)} ${JSON.stringify(`${config.username}@${config.host}:${config.remotePath}/`)}`
    )
  } else if (config.password) {
    // Password-based auth (requires sshpass)
    await run(
      `sshpass -p ${JSON.stringify(config.password)} scp -P ${config.port} -o StrictHostKeyChecking=no ${JSON.stringify(filePath)} ${JSON.stringify(`${config.username}@${config.host}:${config.remotePath}/`)}`
    )
  } else {
    throw new Error('SFTP: either password or keyPath must be configured')
  }

  return `sftp://${config.host}:${config.port}${remoteDest}`
}

// ── Google Drive provider ────────────────────────────────────────────────────

async function getGDriveConfig(): Promise<GDriveConfig | null> {
  const keys = ['gdrive_service_account', 'gdrive_folder_id']
  const m = await getSettingsMap(keys)
  if (!m.gdrive_service_account || !m.gdrive_folder_id) return null
  return {
    serviceAccountJson: m.gdrive_service_account,
    folderId: m.gdrive_folder_id,
  }
}

function createJwt(serviceAccount: any): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const unsigned = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(unsigned)
  const signature = sign.sign(serviceAccount.private_key, 'base64url')
  return `${unsigned}.${signature}`
}

export async function uploadToGoogleDrive(filePath: string, config: GDriveConfig): Promise<string> {
  const serviceAccount = JSON.parse(config.serviceAccountJson)
  const jwt = createJwt(serviceAccount)

  // Step 1: exchange JWT for access token
  const tokenResult = await run(
    `curl -s -X POST https://oauth2.googleapis.com/token ` +
    `-d ${JSON.stringify(`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`)} ` +
    `-H "Content-Type: application/x-www-form-urlencoded"`
  )
  const tokenData = JSON.parse(tokenResult.stdout)
  if (!tokenData.access_token) {
    throw new Error(`Google Drive: failed to get access token: ${tokenResult.stdout}`)
  }
  const accessToken = tokenData.access_token

  // Step 2: upload file via resumable upload (supports large files)
  const fileName = path.basename(filePath)
  const metadata = JSON.stringify({
    name: fileName,
    parents: [config.folderId],
  })

  // Initiate resumable upload
  const initResult = await run(
    `curl -s -X POST "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable" ` +
    `-H "Authorization: Bearer ${accessToken}" ` +
    `-H "Content-Type: application/json" ` +
    `-d ${JSON.stringify(metadata)} ` +
    `-D -`
  )

  // Extract location header for resumable upload URL
  const locationMatch = initResult.stdout.match(/location:\s*(.+)/i)
  if (locationMatch) {
    const uploadUrl = locationMatch[1].trim()
    // Upload the file content
    const uploadResult = await run(
      `curl -s -X PUT ${JSON.stringify(uploadUrl)} ` +
      `-H "Content-Type: application/octet-stream" ` +
      `--data-binary @${JSON.stringify(filePath)}`
    )
    const fileData = JSON.parse(uploadResult.stdout)
    return `https://drive.google.com/file/d/${fileData.id}/view`
  }

  // Fallback: simple multipart upload for smaller files
  const uploadResult = await run(
    `curl -s -X POST "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" ` +
    `-H "Authorization: Bearer ${accessToken}" ` +
    `-F "metadata=${metadata};type=application/json" ` +
    `-F "file=@${JSON.stringify(filePath)};type=application/gzip"`
  )
  const fileData = JSON.parse(uploadResult.stdout)
  if (!fileData.id) {
    throw new Error(`Google Drive: upload failed: ${uploadResult.stdout}`)
  }
  return `https://drive.google.com/file/d/${fileData.id}/view`
}

// ── Dropbox provider ─────────────────────────────────────────────────────────

async function getDropboxConfig(): Promise<DropboxConfig | null> {
  const keys = ['dropbox_access_token', 'dropbox_remote_path']
  const m = await getSettingsMap(keys)
  if (!m.dropbox_access_token) return null
  return {
    accessToken: m.dropbox_access_token,
    remotePath: m.dropbox_remote_path || '/overpanel-backups',
  }
}

export async function uploadToDropbox(filePath: string, config: DropboxConfig): Promise<string> {
  const fileName = path.basename(filePath)
  const remoteDest = `${config.remotePath}/${fileName}`

  const apiArg = JSON.stringify({
    path: remoteDest,
    mode: 'overwrite',
    autorename: false,
    mute: false,
  })

  const result = await run(
    `curl -s -X POST https://content.dropboxapi.com/2/files/upload ` +
    `-H "Authorization: Bearer ${config.accessToken}" ` +
    `-H ${JSON.stringify(`Dropbox-API-Arg: ${apiArg}`)} ` +
    `-H "Content-Type: application/octet-stream" ` +
    `--data-binary @${JSON.stringify(filePath)}`
  )

  const data = JSON.parse(result.stdout)
  if (data.error) {
    throw new Error(`Dropbox upload failed: ${JSON.stringify(data.error)}`)
  }

  return `dropbox://${remoteDest}`
}

// ── Upload to ALL configured providers ───────────────────────────────────────

export async function uploadToProviders(filePath: string): Promise<BackupUploadResult[]> {
  const results: BackupUploadResult[] = []

  // Local is always "configured" — the file is already on disk
  results.push({
    provider: 'local',
    success: true,
    url: filePath,
  })

  // S3 / Backblaze
  try {
    const s3Ok = await isS3Configured()
    if (s3Ok) {
      const url = await uploadBackupToS3(filePath)
      results.push({ provider: 's3', success: true, url: url ?? undefined })
    }
  } catch (err: any) {
    results.push({ provider: 's3', success: false, error: err?.message ?? 'S3 upload failed' })
  }

  // SFTP
  try {
    const sftpConfig = await getSftpConfig()
    if (sftpConfig) {
      const url = await uploadToSftp(filePath, sftpConfig)
      results.push({ provider: 'sftp', success: true, url })
    }
  } catch (err: any) {
    results.push({ provider: 'sftp', success: false, error: err?.message ?? 'SFTP upload failed' })
  }

  // Google Drive
  try {
    const gdriveConfig = await getGDriveConfig()
    if (gdriveConfig) {
      const url = await uploadToGoogleDrive(filePath, gdriveConfig)
      results.push({ provider: 'gdrive', success: true, url })
    }
  } catch (err: any) {
    results.push({ provider: 'gdrive', success: false, error: err?.message ?? 'Google Drive upload failed' })
  }

  // Dropbox
  try {
    const dropboxConfig = await getDropboxConfig()
    if (dropboxConfig) {
      const url = await uploadToDropbox(filePath, dropboxConfig)
      results.push({ provider: 'dropbox', success: true, url })
    }
  } catch (err: any) {
    results.push({ provider: 'dropbox', success: false, error: err?.message ?? 'Dropbox upload failed' })
  }

  return results
}

// ── Test a provider connection ───────────────────────────────────────────────

export async function testProvider(
  provider: BackupProvider,
  config: Record<string, any>
): Promise<{ success: boolean; message: string }> {
  try {
    switch (provider) {
      case 'sftp': {
        const sftpConf: SftpConfig = {
          host: config.host,
          port: parseInt(config.port || '22', 10),
          username: config.username,
          password: config.password,
          keyPath: config.keyPath,
          remotePath: config.remotePath || '/backups',
        }
        if (sftpConf.keyPath) {
          await run(
            `ssh -i ${JSON.stringify(sftpConf.keyPath)} -p ${sftpConf.port} -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10 ${JSON.stringify(`${sftpConf.username}@${sftpConf.host}`)} "echo ok"`
          )
        } else if (sftpConf.password) {
          await run(
            `sshpass -p ${JSON.stringify(sftpConf.password)} ssh -p ${sftpConf.port} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${JSON.stringify(`${sftpConf.username}@${sftpConf.host}`)} "echo ok"`
          )
        } else {
          return { success: false, message: 'Either password or keyPath must be provided' }
        }
        return { success: true, message: 'SFTP connection successful' }
      }

      case 'gdrive': {
        const sa = JSON.parse(config.serviceAccountJson || '{}')
        if (!sa.client_email || !sa.private_key) {
          return { success: false, message: 'Invalid service account JSON — missing client_email or private_key' }
        }
        const jwt = createJwt(sa)
        const tokenResult = await run(
          `curl -s -X POST https://oauth2.googleapis.com/token ` +
          `-d ${JSON.stringify(`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`)} ` +
          `-H "Content-Type: application/x-www-form-urlencoded"`
        )
        const tokenData = JSON.parse(tokenResult.stdout)
        if (!tokenData.access_token) {
          return { success: false, message: `Failed to authenticate: ${tokenData.error_description || tokenData.error || 'unknown error'}` }
        }
        return { success: true, message: `Authenticated as ${sa.client_email}` }
      }

      case 'dropbox': {
        if (!config.accessToken) {
          return { success: false, message: 'Access token is required' }
        }
        const result = await run(
          `curl -s -X POST https://api.dropboxapi.com/2/users/get_current_account ` +
          `-H "Authorization: Bearer ${config.accessToken}" ` +
          `-H "Content-Type: application/json" ` +
          `--data "null"`
        )
        const data = JSON.parse(result.stdout)
        if (data.error) {
          return { success: false, message: `Dropbox auth failed: ${JSON.stringify(data.error)}` }
        }
        return { success: true, message: `Connected as ${data.name?.display_name || data.email || 'OK'}` }
      }

      case 's3': {
        // Check if S3 is configured by trying the existing check
        const configured = await isS3Configured()
        return configured
          ? { success: true, message: 'S3 is configured' }
          : { success: false, message: 'S3 is not configured — set s3_endpoint, s3_bucket, s3_access_key, s3_secret_key in settings' }
      }

      case 'local':
        return { success: true, message: 'Local backup storage is always available' }

      default:
        return { success: false, message: `Unknown provider: ${provider}` }
    }
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Connection test failed' }
  }
}
