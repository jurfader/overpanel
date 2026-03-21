import { prisma } from '@overpanel/db'
import { createFullBackup, listBackupFiles, deleteBackupFile } from './backup.js'
import { uploadToProviders } from './backup-providers.js'

// ── Settings helpers ─────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return row?.value ?? null
}

interface ScheduleConfig {
  schedule: 'daily' | 'weekly' | 'monthly' | 'disabled'
  time: string   // "HH:MM" in 24h format
  retention: number // number of backups to keep per site
}

async function getScheduleConfig(): Promise<ScheduleConfig> {
  const [schedule, time, retention] = await Promise.all([
    getSetting('backup_schedule'),
    getSetting('backup_time'),
    getSetting('backup_retention'),
  ])
  return {
    schedule: (schedule as ScheduleConfig['schedule']) || 'disabled',
    time: time || '03:00',
    retention: parseInt(retention || '10', 10),
  }
}

// ── Schedule logic ───────────────────────────────────────────────────────────

let lastRunDate: string | null = null
let schedulerTimer: ReturnType<typeof setInterval> | null = null

function shouldRunNow(config: ScheduleConfig): boolean {
  if (config.schedule === 'disabled') return false

  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  // Only trigger during the configured minute
  if (currentTime !== config.time) return false

  // Prevent running more than once per day
  const today = now.toISOString().slice(0, 10) // YYYY-MM-DD
  if (lastRunDate === today) return false

  const dayOfWeek = now.getDay()  // 0=Sunday
  const dayOfMonth = now.getDate()

  switch (config.schedule) {
    case 'daily':
      return true
    case 'weekly':
      // Run on Sundays
      return dayOfWeek === 0
    case 'monthly':
      // Run on the 1st of each month
      return dayOfMonth === 1
    default:
      return false
  }
}

// ── Main backup run ──────────────────────────────────────────────────────────

async function runScheduledBackup(): Promise<void> {
  const config = await getScheduleConfig()

  console.log('[BackupScheduler] Starting scheduled backup run...')

  // Get all sites
  const sites = await prisma.site.findMany({
    include: {
      databases: {
        select: { name: true, engine: true, dbUser: true },
      },
    },
  })

  if (sites.length === 0) {
    console.log('[BackupScheduler] No sites to back up.')
    return
  }

  for (const site of sites) {
    try {
      console.log(`[BackupScheduler] Backing up site: ${site.domain}`)

      // Pick first database if any
      const db = site.databases[0]

      const result = await createFullBackup(
        site.domain,
        site.documentRoot,
        db?.name,
        db?.engine as 'mysql' | 'postgresql' | undefined,
        db?.dbUser
      )

      // Upload to all configured providers
      const paths = [result.filesPath, result.dbPath].filter(Boolean) as string[]
      for (const p of paths) {
        try {
          const uploadResults = await uploadToProviders(p)
          for (const r of uploadResults) {
            if (r.success) {
              console.log(`[BackupScheduler]   -> ${r.provider}: OK ${r.url ?? ''}`)
            } else {
              console.error(`[BackupScheduler]   -> ${r.provider}: FAILED ${r.error ?? ''}`)
            }
          }
        } catch (uploadErr: any) {
          console.error(`[BackupScheduler]   -> Upload error for ${p}: ${uploadErr?.message}`)
        }
      }

      // Create a DB record for audit
      // Use a system user ID or the first admin
      const admin = await prisma.user.findFirst({ where: { role: 'admin' } })
      if (admin) {
        const backupPath = result.filesPath || result.dbPath || null
        let sizeMb = 0
        if (backupPath) {
          try {
            const { statSync } = await import('fs')
            sizeMb = statSync(backupPath).size / (1024 * 1024)
          } catch {
            // ignore
          }
        }
        await prisma.backup.create({
          data: {
            type: 'full',
            status: 'success',
            sizeMb,
            path: backupPath,
            userId: admin.id,
            siteId: site.id,
          },
        })
      }
    } catch (err: any) {
      console.error(`[BackupScheduler] Failed to back up ${site.domain}: ${err?.message}`)

      // Record failure
      const admin = await prisma.user.findFirst({ where: { role: 'admin' } })
      if (admin) {
        await prisma.backup.create({
          data: {
            type: 'full',
            status: 'failed',
            errorMsg: err?.message ?? 'Scheduled backup failed',
            userId: admin.id,
            siteId: site.id,
          },
        })
      }
    }
  }

  // ── Retention policy: delete old local backups ────────────────────────────
  await applyRetentionPolicy(config.retention)

  console.log('[BackupScheduler] Scheduled backup run complete.')
}

async function applyRetentionPolicy(maxPerSite: number): Promise<void> {
  if (maxPerSite <= 0) return

  const sites = await prisma.site.findMany({ select: { domain: true } })

  for (const site of sites) {
    try {
      const files = await listBackupFiles(site.domain)
      // files are sorted newest-first by listBackupFiles
      if (files.length > maxPerSite) {
        const toDelete = files.slice(maxPerSite)
        for (const f of toDelete) {
          try {
            await deleteBackupFile(f.filename)
            console.log(`[BackupScheduler] Retention: deleted ${f.filename}`)

            // Also remove DB record if it references this path
            await prisma.backup.deleteMany({
              where: { path: f.path },
            })
          } catch {
            // file may already be gone
          }
        }
      }
    } catch {
      // skip domain
    }
  }
}

// ── Scheduler entry point ────────────────────────────────────────────────────

export function startBackupScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
  }

  console.log('[BackupScheduler] Scheduler started — checking every 60s.')

  // Check every 60 seconds
  schedulerTimer = setInterval(async () => {
    try {
      const config = await getScheduleConfig()
      if (shouldRunNow(config)) {
        const today = new Date().toISOString().slice(0, 10)
        lastRunDate = today
        await runScheduledBackup()
      }
    } catch (err: any) {
      console.error('[BackupScheduler] Scheduler error:', err?.message ?? err)
    }
  }, 60_000)

  // Don't let the timer prevent Node from exiting
  if (schedulerTimer.unref) {
    schedulerTimer.unref()
  }
}

export function stopBackupScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
    console.log('[BackupScheduler] Scheduler stopped.')
  }
}
