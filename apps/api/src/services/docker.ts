import { run, sq } from './shell.js'

export interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string    // "running", "exited", "paused"
  state: string
  ports: string     // e.g. "0.0.0.0:3000->3000/tcp"
  created: string
  labels: Record<string, string>
}

export interface ContainerStats {
  cpuPercent: string
  memUsage: string
  memPercent: string
  netIO: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateName(name: string): string {
  if (!/^[a-z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid container name: ${name}`)
  }
  return name
}

function validateImage(image: string): string {
  if (!/^[a-zA-Z0-9._\-/:]+$/.test(image)) {
    throw new Error(`Invalid image name: ${image}`)
  }
  return image
}

function validatePort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`)
  }
  return port
}

// ── Docker availability ───────────────────────────────────────────────────────

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await run('which docker && docker info >/dev/null 2>&1')
    return true
  } catch {
    return false
  }
}

export async function getDockerVersion(): Promise<string> {
  const { stdout } = await run('docker --version')
  // "Docker version 24.0.5, build ced0996" -> "24.0.5"
  const match = stdout.match(/Docker version\s+([\d.]+)/)
  return match ? match[1] : stdout.trim()
}

// ── Container listing ─────────────────────────────────────────────────────────

export async function listContainers(all = true): Promise<ContainerInfo[]> {
  const allFlag = all ? ' --all' : ''
  const { stdout } = await run(`docker ps${allFlag} --format '{{json .}}'`)
  const lines = stdout.split('\n').filter(l => l.trim().length > 0)

  return lines.map(line => {
    const raw = JSON.parse(line) as Record<string, string>
    // Parse labels: "key=value,key2=value2"
    const labels: Record<string, string> = {}
    if (raw['Labels']) {
      for (const pair of raw['Labels'].split(',')) {
        const eqIdx = pair.indexOf('=')
        if (eqIdx !== -1) {
          labels[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1)
        }
      }
    }
    return {
      id: raw['ID'] ?? raw['Id'] ?? '',
      name: (raw['Names'] ?? raw['Name'] ?? '').replace(/^\//, ''),
      image: raw['Image'] ?? '',
      status: raw['Status'] ?? '',
      state: raw['State'] ?? '',
      ports: raw['Ports'] ?? '',
      created: raw['CreatedAt'] ?? raw['Created'] ?? '',
      labels,
    }
  })
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getContainerStats(name: string): Promise<ContainerStats> {
  validateName(name)
  const { stdout } = await run(`docker stats ${name} --no-stream --format '{{json .}}'`)
  const raw = JSON.parse(stdout.trim()) as Record<string, string>
  return {
    cpuPercent: raw['CPUPerc'] ?? '',
    memUsage: raw['MemUsage'] ?? '',
    memPercent: raw['MemPerc'] ?? '',
    netIO: raw['NetIO'] ?? '',
  }
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export async function getContainerLogs(name: string, lines = 100): Promise<string[]> {
  validateName(name)
  const { stdout } = await run(`docker logs --tail ${lines} ${name} 2>&1`)
  return stdout.split('\n').filter(l => l.length > 0)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export async function startContainer(name: string): Promise<void> {
  validateName(name)
  await run(`docker start ${name}`)
}

export async function stopContainer(name: string): Promise<void> {
  validateName(name)
  await run(`docker stop ${name}`)
}

export async function restartContainer(name: string): Promise<void> {
  validateName(name)
  await run(`docker restart ${name}`)
}

export async function removeContainer(name: string, force = true): Promise<void> {
  validateName(name)
  const forceFlag = force ? '-f ' : ''
  await run(`docker rm ${forceFlag}${name}`)
}

// ── Image ─────────────────────────────────────────────────────────────────────

export async function pullImage(image: string): Promise<void> {
  validateImage(image)
  await run(`docker pull ${image}`)
}

// ── Create & start ────────────────────────────────────────────────────────────

export interface CreateContainerOpts {
  name: string           // container name
  image: string          // docker image:tag
  externalPort: number   // host port
  internalPort: number   // container port
  envVars?: Record<string, string>
  volumes?: Array<{ host: string; container: string }>
  restart?: string       // "always" | "unless-stopped" | "no"
  labels?: Record<string, string>
  cpuLimit?: number      // CPU cores, e.g. 0.5
  memoryLimit?: string   // Memory limit, e.g. "512m", "1g"
}

export async function createAndStartContainer(opts: CreateContainerOpts): Promise<void> {
  validateName(opts.name)
  validateImage(opts.image)
  validatePort(opts.externalPort)
  validatePort(opts.internalPort)

  const restartPolicy = opts.restart ?? 'always'

  const parts: string[] = [
    'docker run -d',
    `--name ${opts.name}`,
    `--restart ${restartPolicy}`,
    `-p ${opts.externalPort}:${opts.internalPort}`,
  ]

  if (opts.envVars) {
    for (const [key, value] of Object.entries(opts.envVars)) {
      parts.push(`-e ${key}=${sq(value)}`)
    }
  }

  if (opts.volumes) {
    for (const vol of opts.volumes) {
      parts.push(`-v ${sq(vol.host)}:${sq(vol.container)}`)
    }
  }

  if (opts.labels) {
    for (const [key, value] of Object.entries(opts.labels)) {
      parts.push(`-l ${key}=${sq(value)}`)
    }
  }

  if (opts.cpuLimit) parts.push(`--cpus ${String(opts.cpuLimit)}`)
  if (opts.memoryLimit) parts.push(`--memory ${opts.memoryLimit}`)

  parts.push(opts.image)

  await run(parts.join(' \\\n  '))
}

// ── Port discovery ────────────────────────────────────────────────────────────

export async function findAvailablePort(start = 10000, end = 20000): Promise<number> {
  for (let port = start; port <= end; port++) {
    try {
      await run(`ss -tuln | grep :${port}`)
      // If the command succeeded, the port is in use — try next
    } catch {
      // grep exits non-zero when no match found — port is free
      return port
    }
  }
  throw new Error(`No available port found in range ${start}-${end}`)
}
