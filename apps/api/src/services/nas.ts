/**
 * NAS backup management — connects to NAS via SSH/SCP
 * Configuration read from environment or panel settings.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { prisma } from '@overpanel/db'

const execAsync = promisify(exec)

const NAS_PASSWORD_FILE = '/root/.nas-password'
const SSH_OPTS = '-o HostKeyAlgorithms=+ssh-rsa -o StrictHostKeyChecking=no'

// ── Config from DB settings ─────────────────────────────────────────────────

interface NasConfig {
  host: string      // user@ip
  backupDir: string  // remote path
}

let _configCache: NasConfig | null = null
let _configCacheTime = 0

async function getNasConfig(): Promise<NasConfig | null> {
  // Cache for 60s
  if (_configCache && Date.now() - _configCacheTime < 60_000) return _configCache

  const rows = await prisma.setting.findMany({
    where: { key: { in: ['nas_host', 'nas_user', 'nas_backup_dir'] } },
  })
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

  const nasHost = map.nas_host || process.env.NAS_HOST || ''
  const nasUser = map.nas_user || process.env.NAS_USER || 'admin'
  const backupDir = map.nas_backup_dir || process.env.NAS_BACKUP_DIR || ''

  if (!nasHost || !backupDir) return null

  _configCache = { host: `${nasUser}@${nasHost}`, backupDir }
  _configCacheTime = Date.now()
  return _configCache
}

export function clearNasConfigCache(): void {
  _configCache = null
  _configCacheTime = 0
}

function sshCmd(cfg: NasConfig, cmd: string): string {
  return `sshpass -f ${NAS_PASSWORD_FILE} ssh ${SSH_OPTS} ${cfg.host} "${cmd}"`
}

function scpFrom(cfg: NasConfig, remote: string, local: string): string {
  return `sshpass -f ${NAS_PASSWORD_FILE} scp ${SSH_OPTS} ${cfg.host}:${remote} ${local}`
}

export async function isNasConfigured(): Promise<boolean> {
  if (!existsSync(NAS_PASSWORD_FILE)) return false
  const cfg = await getNasConfig()
  return cfg !== null
}

// ── Disk usage ──────────────────────────────────────────────────────────────

export interface NasDiskInfo {
  total: number    // bytes
  used: number     // bytes
  available: number // bytes
  percent: number
  mountPoint: string
}

export async function getNasDiskInfo(): Promise<NasDiskInfo | null> {
  const cfg = await getNasConfig()
  if (!cfg) return null
  try {
    const { stdout } = await execAsync(sshCmd(cfg, `df -B1 ${cfg.backupDir} | tail -1`), { timeout: 10_000 })
    const parts = stdout.trim().split(/\s+/)
    if (parts.length < 5) return null
    return {
      total: parseInt(parts[1] ?? '0'),
      used: parseInt(parts[2] ?? '0'),
      available: parseInt(parts[3] ?? '0'),
      percent: parseInt((parts[4] ?? '0').replace('%', '')),
      mountPoint: parts[5] ?? cfg.backupDir,
    }
  } catch {
    return null
  }
}

// ── Backup listing ──────────────────────────────────────────────────────────

export interface NasBackupEntry {
  filename: string
  sizeMb: number
  date: string
  type: 'daily' | 'system-image'
}

export async function listNasBackups(): Promise<NasBackupEntry[]> {
  const cfg = await getNasConfig()
  if (!cfg) return []
  const backups: NasBackupEntry[] = []

  try {
    // Daily backups
    const { stdout: daily } = await execAsync(
      sshCmd(cfg, `ls -lh ${cfg.backupDir}/overpanel-backup-*.tar.gz 2>/dev/null || true`),
      { timeout: 10_000 }
    )
    for (const line of daily.split('\n').filter(l => l.includes('overpanel-backup-'))) {
      const parts = line.trim().split(/\s+/)
      const filename = parts[parts.length - 1]?.split('/').pop() ?? ''
      const sizeStr = parts[4] ?? '0'
      const dateMatch = filename.match(/overpanel-backup-(\d{4}-\d{2}-\d{2})/)
      backups.push({
        filename,
        sizeMb: parseSize(sizeStr),
        date: dateMatch?.[1] ?? '',
        type: 'daily',
      })
    }

    // System images
    const { stdout: images } = await execAsync(
      sshCmd(cfg, `ls -lh ${cfg.backupDir}/system-images/system-image-*.tar.gz 2>/dev/null || true`),
      { timeout: 10_000 }
    )
    for (const line of images.split('\n').filter(l => l.includes('system-image-'))) {
      const parts = line.trim().split(/\s+/)
      const filename = parts[parts.length - 1]?.split('/').pop() ?? ''
      const sizeStr = parts[4] ?? '0'
      const dateMatch = filename.match(/system-image-(\d{4}-\d{2}-\d{2})/)
      backups.push({
        filename,
        sizeMb: parseSize(sizeStr),
        date: dateMatch?.[1] ?? '',
        type: 'system-image',
      })
    }
  } catch (err: any) {
    console.warn('[NAS] Failed to list backups:', err.message)
  }

  return backups.sort((a, b) => b.date.localeCompare(a.date))
}

function parseSize(s: string): number {
  const num = parseFloat(s)
  if (s.endsWith('G')) return num * 1024
  if (s.endsWith('M')) return num
  if (s.endsWith('K')) return num / 1024
  return num / (1024 * 1024) // bytes
}

// ── Download backup from NAS ────────────────────────────────────────────────

export async function downloadNasBackup(filename: string, type: 'daily' | 'system-image'): Promise<string> {
  if (filename.includes('/') || filename.includes('..')) {
    throw new Error('Invalid filename')
  }
  const cfg = await getNasConfig()
  if (!cfg) throw new Error('NAS not configured')

  const remotePath = type === 'system-image'
    ? `${cfg.backupDir}/system-images/${filename}`
    : `${cfg.backupDir}/${filename}`
  const localPath = `/tmp/nas-restore-${filename}`

  await execAsync(scpFrom(cfg, remotePath, localPath), { timeout: 600_000 })
  return localPath
}

// ── Restore from daily backup ───────────────────────────────────────────────

export async function restoreFromNasBackup(filename: string): Promise<string[]> {
  const log: string[] = []

  // Download from NAS
  log.push('Pobieranie backupu z NAS...')
  const localPath = await downloadNasBackup(filename, 'daily')
  log.push(`Pobrano: ${localPath}`)

  // Extract to temp
  const extractDir = `/tmp/nas-restore-${Date.now()}`
  await execAsync(`mkdir -p ${extractDir} && tar xzf ${localPath} -C ${extractDir}`)
  log.push('Rozpakowano archiwum')

  // Restore panel DB
  if (existsSync(`${extractDir}/panel.db`)) {
    await execAsync(`cp ${extractDir}/panel.db /opt/overpanel/packages/db/panel.db`)
    log.push('Przywrócono bazę panelu')
  }

  // Restore WWW
  if (existsSync(`${extractDir}/www.tar.gz`)) {
    await execAsync(`tar xzf ${extractDir}/www.tar.gz -C /var/www/`)
    log.push('Przywrócono pliki stron WWW')
  }

  // Restore nginx
  if (existsSync(`${extractDir}/nginx.tar.gz`)) {
    await execAsync(`tar xzf ${extractDir}/nginx.tar.gz -C /etc/nginx/`)
    await execAsync('nginx -t && systemctl reload nginx').catch(() => {})
    log.push('Przywrócono konfigurację nginx')
  }

  // Restore cloudflared
  if (existsSync(`${extractDir}/cloudflared.tar.gz`)) {
    await execAsync(`tar xzf ${extractDir}/cloudflared.tar.gz -C /etc/`)
    await execAsync('systemctl restart cloudflared').catch(() => {})
    log.push('Przywrócono konfigurację cloudflared')
  }

  // Restore OverCMS env files
  if (existsSync(`${extractDir}/overcms`)) {
    const { readdirSync } = await import('fs')
    const dirs = readdirSync(`${extractDir}/overcms`)
    for (const domain of dirs) {
      const envSrc = `${extractDir}/overcms/${domain}/env`
      const envDst = `/opt/overcms-sites/${domain}/app/.env`
      if (existsSync(envSrc) && existsSync(`/opt/overcms-sites/${domain}`)) {
        await execAsync(`cp ${envSrc} ${envDst}`)
        log.push(`Przywrócono .env dla ${domain}`)
      }
      // Restore DB dump
      const sqlSrc = `${extractDir}/overcms/${domain}/db.sql`
      if (existsSync(sqlSrc)) {
        const pgContainer = `overcms-pg-${domain.replace(/\./g, '-')}`
        await execAsync(`cat ${sqlSrc} | docker exec -i ${pgContainer} psql -U overcms overcms 2>/dev/null`).catch(() => {})
        log.push(`Przywrócono bazę danych dla ${domain}`)
      }
    }
  }

  // Cleanup
  await execAsync(`rm -rf ${extractDir} ${localPath}`).catch(() => {})
  log.push('Przywracanie zakończone!')

  return log
}

// ── Delete backup from NAS ──────────────────────────────────────────────────

export async function deleteNasBackup(filename: string, type: 'daily' | 'system-image'): Promise<void> {
  if (filename.includes('/') || filename.includes('..')) {
    throw new Error('Invalid filename')
  }
  const cfg = await getNasConfig()
  if (!cfg) throw new Error('NAS not configured')
  const remotePath = type === 'system-image'
    ? `${cfg.backupDir}/system-images/${filename}`
    : `${cfg.backupDir}/${filename}`
  await execAsync(sshCmd(cfg, `rm -f ${remotePath}`), { timeout: 10_000 })
}

// ── Run backup now ──────────────────────────────────────────────────────────

export async function triggerDailyBackup(): Promise<void> {
  await execAsync('/usr/local/bin/backup-to-nas.sh', { timeout: 300_000 })
}

export async function triggerSystemImageBackup(): Promise<void> {
  await execAsync('/usr/local/bin/backup-system-image.sh', { timeout: 1800_000 })
}
