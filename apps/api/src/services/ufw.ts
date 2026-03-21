import { run } from './shell.js'

export interface UfwRule {
  number: number
  to: string        // port or "Anywhere"
  action: string    // "ALLOW" | "DENY" | "REJECT"
  from: string      // source IP or "Anywhere"
  protocol?: string // "tcp" | "udp" | "any"
  comment?: string
}

export interface UfwStatus {
  enabled: boolean
  rules: UfwRule[]
}

function validatePort(port: string): void {
  if (!/^[0-9]+(:[0-9]+)?$/.test(port)) {
    throw new Error(`Invalid port: ${port}`)
  }
}

function validateFrom(from: string): void {
  if (!/^[0-9./]+$|^any$/.test(from)) {
    throw new Error(`Invalid from address: ${from}`)
  }
}

export async function getUfwStatus(): Promise<UfwStatus> {
  const { stdout } = await run('ufw status numbered')

  const enabled = /Status:\s+active/i.test(stdout)
  const rules: UfwRule[] = []

  const lines = stdout.split('\n')
  for (const line of lines) {
    // Skip IPv6 rules
    if (line.includes('(v6)')) continue

    // Match lines like: [ 1] 22/tcp                     ALLOW IN    Anywhere
    const match = line.match(/^\[\s*(\d+)\]\s+(\S+)\s+(ALLOW|DENY|REJECT)\s+(?:IN\s+)?(.+)$/)
    if (!match) continue

    const number = parseInt(match[1], 10)
    const toRaw = match[2].trim()
    const action = match[3].trim()
    const fromRaw = match[4].trim()

    let to = toRaw
    let protocol: string | undefined

    // Parse protocol from port/protocol format
    const protoMatch = toRaw.match(/^(.+)\/(tcp|udp)$/)
    if (protoMatch) {
      to = protoMatch[1]
      protocol = protoMatch[2]
    }

    rules.push({
      number,
      to,
      action,
      from: fromRaw,
      protocol,
    })
  }

  return { enabled, rules }
}

export async function addUfwRule(opts: {
  port: string
  protocol: 'tcp' | 'udp' | 'any'
  action: 'allow' | 'deny' | 'reject'
  from?: string
}): Promise<void> {
  const { port, protocol, action } = opts
  const from = opts.from ?? 'any'

  validatePort(port)
  validateFrom(from)

  let cmd: string

  if (protocol === 'any') {
    if (from === 'any') {
      cmd = `ufw ${action} ${port}`
    } else {
      cmd = `ufw ${action} from ${from} to any port ${port}`
    }
  } else {
    if (from === 'any') {
      cmd = `ufw ${action} ${port}/${protocol}`
    } else {
      cmd = `ufw ${action} from ${from} to any port ${port} proto ${protocol}`
    }
  }

  await run(cmd)
}

export async function deleteUfwRule(ruleNumber: number): Promise<void> {
  if (!Number.isInteger(ruleNumber) || ruleNumber < 1) {
    throw new Error(`Invalid rule number: ${ruleNumber}`)
  }
  await run(`ufw --force delete ${ruleNumber}`)
}

export async function enableUfw(): Promise<void> {
  await run('ufw --force enable')
}

export async function disableUfw(): Promise<void> {
  await run('ufw --force disable')
}

export async function resetUfw(): Promise<void> {
  await run('ufw --force reset')
}
