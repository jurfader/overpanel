import { run } from './shell.js'

const ROOT_PASS = process.env.MYSQL_ROOT_PASSWORD ?? ''
const MYSQL = `mysql -u root${ROOT_PASS ? ` -p'${ROOT_PASS}'` : ''} -e`

export async function createMysqlDatabase(name: string, user: string, password: string) {
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_')
  const safeUser = user.replace(/[^a-zA-Z0-9_]/g, '_')
  await run(`${MYSQL} "CREATE DATABASE IF NOT EXISTS ${safeName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`)
  await run(`${MYSQL} "CREATE USER IF NOT EXISTS '${safeUser}'@'localhost' IDENTIFIED BY '${password}';"`)
  await run(`${MYSQL} "GRANT ALL PRIVILEGES ON ${safeName}.* TO '${safeUser}'@'localhost';"`)
  await run(`${MYSQL} "FLUSH PRIVILEGES;"`)
}

export async function dropMysqlDatabase(name: string, user: string) {
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_')
  const safeUser = user.replace(/[^a-zA-Z0-9_]/g, '_')
  await run(`${MYSQL} "DROP DATABASE IF EXISTS ${safeName};"`)
  await run(`${MYSQL} "DROP USER IF EXISTS '${safeUser}'@'localhost';"`)
  await run(`${MYSQL} "FLUSH PRIVILEGES;"`)
}

export async function resetMysqlPassword(user: string, newPassword: string) {
  await run(`${MYSQL} "ALTER USER '${user}'@'localhost' IDENTIFIED BY '${newPassword}';"`)
  await run(`${MYSQL} "FLUSH PRIVILEGES;"`)
}

export async function dumpMysqlDatabase(name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `/var/overpanel/backups/${name}_${timestamp}.sql.gz`
  await run(`mysqldump -u root${ROOT_PASS ? ` -p'${ROOT_PASS}'` : ''} ${name} | gzip > ${path}`)
  return path
}
