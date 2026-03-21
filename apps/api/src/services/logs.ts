import { run } from './shell.js'

export interface LogLine {
  raw: string
  timestamp?: string
  level?: 'info' | 'warn' | 'error'
}

function validateDomain(domain: string): void {
  if (!/^[a-zA-Z0-9.-]+$/.test(domain)) {
    throw new Error(`Invalid domain: ${domain}`)
  }
}

function clampLines(lines: number): number {
  return Math.min(2000, Math.max(10, lines))
}

function splitOutput(stdout: string): string[] {
  return stdout.split('\n').filter((line) => line.trim() !== '')
}

export async function getNginxAccessLog(domain: string, lines = 200): Promise<string[]> {
  validateDomain(domain)
  const n = clampLines(lines)
  const { stdout } = await run(
    `tail -n ${n} /var/www/${domain}/logs/access.log 2>/dev/null || echo ""`
  )
  return splitOutput(stdout)
}

export async function getNginxErrorLog(domain: string, lines = 200): Promise<string[]> {
  validateDomain(domain)
  const n = clampLines(lines)
  const { stdout } = await run(
    `tail -n ${n} /var/www/${domain}/logs/error.log 2>/dev/null || echo ""`
  )
  return splitOutput(stdout)
}

export async function getSystemLog(lines = 200): Promise<string[]> {
  const n = clampLines(lines)
  const { stdout } = await run(
    `journalctl -n ${n} --no-pager -o short 2>/dev/null || tail -n ${n} /var/log/syslog 2>/dev/null || echo ""`
  )
  return splitOutput(stdout)
}

export async function getPhpFpmLog(phpVersion = '8.3', lines = 200): Promise<string[]> {
  const n = clampLines(lines)
  // phpVersion validated via Zod enum in the route; use esc for the version string
  if (!/^[0-9.]+$/.test(phpVersion)) {
    throw new Error(`Invalid PHP version: ${phpVersion}`)
  }
  const { stdout } = await run(
    `tail -n ${n} /var/log/php${phpVersion}-fpm.log 2>/dev/null || echo ""`
  )
  return splitOutput(stdout)
}
