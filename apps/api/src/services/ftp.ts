import { run, esc } from './shell.js'
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'

// Single-quote shell escaping for passwords (allows arbitrary characters)
function sq(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`
}

function validateUsername(username: string): void {
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(username)) {
    throw new Error(`Invalid FTP username: must match /^[a-z][a-z0-9_]{0,31}$/`)
  }
}

function validateHomeDir(homeDir: string): void {
  if (!homeDir.startsWith('/var/www/')) {
    throw new Error(`Invalid homeDir: must start with /var/www/ (got: ${homeDir})`)
  }
}

export async function createFtpUser(username: string, password: string, homeDir: string): Promise<void> {
  validateUsername(username)
  validateHomeDir(homeDir)

  // 1. Create home directory
  if (!existsSync(homeDir)) {
    await mkdir(homeDir, { recursive: true })
  }

  // 2. Set ownership to www-data (FTP daemon runs as www-data)
  await run(`chown www-data:www-data ${esc(homeDir)}`)

  // 3. Create system user if not exists (no login shell, no interactive access)
  await run(`useradd -r -s /sbin/nologin -d ${esc(homeDir)} ${esc(username)} 2>/dev/null || true`)

  // 4. Add virtual FTP user via pure-pw (runs as www-data uid)
  await run(
    `printf '%s\\n%s\\n' ${sq(password)} ${sq(password)} | pure-pw useradd ${esc(username)} -u www-data -d ${esc(homeDir)} -m`
  )

  // 5. Rebuild PureDB
  await run('pure-pw mkdb')
}

export async function deleteFtpUser(username: string): Promise<void> {
  validateUsername(username)

  // Remove from PureDB and update DB atomically
  await run(`pure-pw userdel ${esc(username)} -m`)

  // Remove system user (ignore error if already gone)
  await run(`userdel ${esc(username)} 2>/dev/null || true`)
}

export async function resetFtpPassword(username: string, newPassword: string): Promise<void> {
  validateUsername(username)

  await run(
    `printf '%s\\n%s\\n' ${sq(newPassword)} ${sq(newPassword)} | pure-pw passwd ${esc(username)} -m`
  )
}

export async function listFtpUsers(): Promise<{ username: string; homeDir: string }[]> {
  let stdout: string
  try {
    const result = await run('pure-pw list')
    stdout = result.stdout
  } catch {
    return []
  }

  const users: { username: string; homeDir: string }[] = []

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Output format: "username    /var/www/domain/public (./)
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue

    const username = parts[0]
    // Remove trailing "(./)" annotation if present
    let homeDir = parts[1].replace(/\(.*\)$/, '').trim()
    if (!homeDir) continue

    users.push({ username, homeDir })
  }

  return users
}

export async function isFtpAvailable(): Promise<boolean> {
  try {
    const { stdout } = await run('which pure-pw 2>/dev/null')
    return stdout.trim().length > 0
  } catch {
    return false
  }
}
