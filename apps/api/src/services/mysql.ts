import { run } from './shell.js'

const ROOT_PASS = process.env.MYSQL_ROOT_PASSWORD ?? ''
const MYSQL = `mysql -u root${ROOT_PASS ? ` -p'${ROOT_PASS}'` : ''} -e`

export async function createMysqlDatabase(name: string, user: string, password: string) {
  await run(`${MYSQL} "CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`)
  await run(`${MYSQL} "CREATE USER IF NOT EXISTS '${user}'@'localhost' IDENTIFIED BY '${password}';"`)
  await run(`${MYSQL} "GRANT ALL PRIVILEGES ON \`${name}\`.* TO '${user}'@'localhost';"`)
  await run(`${MYSQL} "FLUSH PRIVILEGES;"`)
}

export async function dropMysqlDatabase(name: string, user: string) {
  await run(`${MYSQL} "DROP DATABASE IF EXISTS \`${name}\`;"`)
  await run(`${MYSQL} "DROP USER IF EXISTS '${user}'@'localhost';"`)
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
