import { run, esc } from './shell.js'

// Każda strona dostaje własnego użytkownika systemowego (izolacja)
export async function createSystemUser(domain: string) {
  const username = domainToUsername(domain)
  const homeDir = `/var/www/${esc(domain)}`

  // Utwórz użytkownika jeśli nie istnieje
  await run(
    `id ${username} &>/dev/null || useradd -r -s /bin/false -d ${homeDir} ${username}`
  )

  // Ustaw uprawnienia
  await run(`chown -R ${username}:www-data ${homeDir}`)
  await run(`chmod -R 750 ${homeDir}`)
  await run(`chmod -R 770 ${homeDir}/public`)
}

export async function deleteSystemUser(domain: string) {
  const username = domainToUsername(domain)
  try {
    await run(`userdel ${username}`)
  } catch {
    // Ignoruj jeśli nie istnieje
  }
}

// example.com → op_example_com
function domainToUsername(domain: string): string {
  return 'op_' + domain.replace(/[^a-z0-9]/g, '_').slice(0, 28)
}
