import * as pty from 'node-pty'

export interface PtySession {
  pid: number
  term: pty.IPty
}

const sessions = new Map<string, PtySession>()

export function createSession(socketId: string, cols = 80, rows = 24): PtySession {
  const term = pty.spawn('/bin/bash', [], {
    name: 'xterm-color',
    cols,
    rows,
    cwd: process.env.HOME ?? '/root',
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>,
  })

  const session: PtySession = { pid: term.pid, term }
  sessions.set(socketId, session)
  return session
}

export function getSession(socketId: string): PtySession | undefined {
  return sessions.get(socketId)
}

export function resizeSession(socketId: string, cols: number, rows: number): void {
  sessions.get(socketId)?.term.resize(cols, rows)
}

export function writeSession(socketId: string, data: string): void {
  sessions.get(socketId)?.term.write(data)
}

export function destroySession(socketId: string): void {
  const session = sessions.get(socketId)
  if (session) {
    try { session.term.kill() } catch {}
    sessions.delete(socketId)
  }
}

export function getSessionCount(): number {
  return sessions.size
}
