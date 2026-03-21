import { run, esc } from './shell.js'

function sq(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`
}

export interface Pm2App {
  name: string
  status: 'online' | 'stopped' | 'errored' | string
  pid: number | null
  restarts: number
  uptime: number | null
  memory: number | null
  cpu: number | null
  pm_id: number
}

export async function isPm2Available(): Promise<boolean> {
  try {
    await run('which pm2')
    return true
  } catch {
    return false
  }
}

export async function listApps(): Promise<Pm2App[]> {
  try {
    const { stdout } = await run('pm2 jlist')
    const data = JSON.parse(stdout.trim() || '[]') as any[]
    return data.map(parseApp)
  } catch {
    return []
  }
}

export async function getApp(name: string): Promise<Pm2App | null> {
  const apps = await listApps()
  return apps.find((a) => a.name === name) ?? null
}

function parseApp(raw: any): Pm2App {
  return {
    name: raw.name ?? '',
    status: raw.pm2_env?.status ?? 'stopped',
    pid: raw.pid ?? null,
    restarts: raw.pm2_env?.restart_time ?? 0,
    uptime: raw.pm2_env?.pm_uptime ?? null,
    memory: raw.monit?.memory ?? null,
    cpu: raw.monit?.cpu ?? null,
    pm_id: raw.pm_id ?? 0,
  }
}

export interface StartAppOptions {
  name: string    // PM2 process name (= site domain slug)
  script: string  // entry point, e.g. "server.js" or "index.js"
  cwd: string     // working directory, e.g. /var/www/domain
  port: number
  nodeArgs?: string
}

export async function startApp({ name, script, cwd, port, nodeArgs }: StartAppOptions): Promise<void> {
  const safeName = sq(name)
  const safeCwd = esc(cwd)
  const safeScript = sq(script)
  const argsFlag = nodeArgs ? `--node-args=${sq(nodeArgs)}` : ''
  await run(
    `pm2 start ${safeScript} --name ${safeName} --cwd ${safeCwd} ${argsFlag} -- ` +
    `--env PORT=${port} && pm2 save`
  )
}

export async function stopApp(name: string): Promise<void> {
  await run(`pm2 stop ${sq(name)} && pm2 save`)
}

export async function restartApp(name: string): Promise<void> {
  await run(`pm2 restart ${sq(name)}`)
}

export async function deleteApp(name: string): Promise<void> {
  try {
    await run(`pm2 delete ${sq(name)} && pm2 save`)
  } catch {
    // ignore if already absent
  }
}

export async function getAppLogs(name: string, lines = 100): Promise<string> {
  const safeLines = Math.min(Math.max(lines, 10), 2000)
  try {
    const { stdout } = await run(`pm2 logs ${sq(name)} --lines ${safeLines} --nostream --raw 2>&1`)
    return stdout
  } catch {
    return ''
  }
}

export async function saveConfig(): Promise<void> {
  await run('pm2 save')
}
