import path from 'path'
import { mkdir, readdir, unlink } from 'fs/promises'
import { existsSync, statSync } from 'fs'
import { run, esc } from './shell.js'

export const BACKUP_DIR = '/var/overpanel/backups'

export interface BackupFile {
  filename: string
  path: string
  sizeMb: number
  createdAt: Date
  type: 'files' | 'database' | 'full'
  domain?: string
}

// Ensure backup directory exists
async function ensureBackupDir(): Promise<void> {
  await mkdir(BACKUP_DIR, { recursive: true })
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

export async function backupSiteFiles(domain: string, documentRoot: string): Promise<string> {
  await ensureBackupDir()
  const ts = timestamp()
  const filename = `${domain}_files_${ts}.tar.gz`
  const backupPath = path.join(BACKUP_DIR, filename)
  const parentDir = path.dirname(documentRoot)
  const baseName = path.basename(documentRoot)
  await run(`tar -czf ${backupPath} -C ${esc(parentDir)} ${esc(baseName)}`)
  return backupPath
}

export async function backupDatabase(
  dbName: string,
  engine: 'mysql' | 'postgresql',
  dbUser?: string
): Promise<string> {
  await ensureBackupDir()
  const ts = timestamp()
  const filename = `${dbName}_db_${ts}.sql.gz`
  const backupPath = path.join(BACKUP_DIR, filename)

  if (engine === 'mysql') {
    const rootPass = process.env.MYSQL_ROOT_PASSWORD ?? ''
    const passFlag = rootPass ? ` -p'${rootPass}'` : ''
    await run(`mysqldump -u root${passFlag} ${esc(dbName)} | gzip > ${backupPath}`)
  } else {
    const user = dbUser ?? 'postgres'
    await run(`PGPASSWORD="" pg_dump -U ${esc(user)} ${esc(dbName)} | gzip > ${backupPath}`)
  }

  return backupPath
}

export async function createFullBackup(
  domain: string,
  documentRoot: string,
  dbName?: string,
  dbEngine?: 'mysql' | 'postgresql',
  dbUser?: string
): Promise<{ filesPath?: string; dbPath?: string }> {
  const result: { filesPath?: string; dbPath?: string } = {}
  result.filesPath = await backupSiteFiles(domain, documentRoot)
  if (dbName && dbEngine) {
    result.dbPath = await backupDatabase(dbName, dbEngine, dbUser)
  }
  return result
}

export async function listBackupFiles(domain?: string): Promise<BackupFile[]> {
  await ensureBackupDir()
  let entries: string[]
  try {
    entries = await readdir(BACKUP_DIR)
  } catch {
    return []
  }

  const files: BackupFile[] = []

  for (const filename of entries) {
    if (domain && !filename.startsWith(domain)) continue

    const filePath = path.join(BACKUP_DIR, filename)
    let stat
    try {
      stat = statSync(filePath)
    } catch {
      continue
    }
    if (!stat.isFile()) continue

    const sizeMb = stat.size / (1024 * 1024)
    const createdAt = stat.birthtime ?? stat.mtime

    let type: BackupFile['type'] = 'full'
    if (filename.includes('_files_')) type = 'files'
    else if (filename.includes('_db_')) type = 'database'

    // Extract domain from filename (part before _files_ or _db_)
    let fileDomain: string | undefined
    const match = filename.match(/^(.+?)_(?:files|db)_/)
    if (match) fileDomain = match[1]

    files.push({ filename, path: filePath, sizeMb, createdAt, type, domain: fileDomain })
  }

  files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return files
}

export async function deleteBackupFile(filename: string): Promise<void> {
  if (filename.includes('/') || filename.includes('..')) {
    throw new Error('Invalid filename: path traversal not allowed')
  }
  const filePath = path.join(BACKUP_DIR, filename)
  await unlink(filePath)
}

export async function getBackupFilePath(filename: string): Promise<string> {
  if (filename.includes('/') || filename.includes('..')) {
    throw new Error('Invalid filename: path traversal not allowed')
  }
  const filePath = path.join(BACKUP_DIR, filename)
  if (!existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filename}`)
  }
  return filePath
}

export async function restoreSiteFiles(filename: string, documentRoot: string): Promise<void> {
  if (filename.includes('/') || filename.includes('..')) {
    throw new Error('Invalid filename: path traversal not allowed')
  }
  if (!documentRoot.startsWith('/var/www/')) {
    throw new Error('Invalid documentRoot: must be within /var/www/')
  }
  const backupPath = path.join(BACKUP_DIR, filename)
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${filename}`)
  }
  const parentDir = path.dirname(documentRoot)
  await run(`tar -xzf ${esc(backupPath)} -C ${esc(parentDir)}`)
}

export async function restoreDatabase(
  filename: string,
  dbName: string,
  engine: 'mysql' | 'postgresql',
  dbUser?: string
): Promise<void> {
  if (filename.includes('/') || filename.includes('..')) {
    throw new Error('Invalid filename: path traversal not allowed')
  }
  const backupPath = path.join(BACKUP_DIR, filename)
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${filename}`)
  }

  if (engine === 'mysql') {
    const rootPass = process.env.MYSQL_ROOT_PASSWORD ?? ''
    const passFlag = rootPass ? ` -p'${rootPass}'` : ''
    await run(`zcat ${esc(backupPath)} | mysql -u root${passFlag} ${esc(dbName)}`)
  } else {
    const user = dbUser ?? 'postgres'
    await run(`zcat ${esc(backupPath)} | PGPASSWORD="" psql -U ${esc(user)} ${esc(dbName)}`)
  }
}
