import { run } from './shell.js'

const PG = (sql: string) => `sudo -u postgres psql -c "${sql}"`

export async function createPgDatabase(name: string, user: string, password: string) {
  await run(PG(`CREATE USER ${user} WITH PASSWORD '${password}';`))
  await run(PG(`CREATE DATABASE ${name} OWNER ${user};`))
  await run(PG(`GRANT ALL PRIVILEGES ON DATABASE ${name} TO ${user};`))
}

export async function dropPgDatabase(name: string, user: string) {
  // Zakończ istniejące połączenia
  await run(PG(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}';`))
  await run(PG(`DROP DATABASE IF EXISTS ${name};`))
  await run(PG(`DROP USER IF EXISTS ${user};`))
}

export async function resetPgPassword(user: string, newPassword: string) {
  await run(PG(`ALTER USER ${user} WITH PASSWORD '${newPassword}';`))
}

export async function dumpPgDatabase(name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `/var/overpanel/backups/${name}_${timestamp}.sql.gz`
  await run(`sudo -u postgres pg_dump ${name} | gzip > ${path}`)
  return path
}
