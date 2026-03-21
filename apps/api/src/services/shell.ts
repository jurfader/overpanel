import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function run(command: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(command, { timeout: 60_000 })
  } catch (err: any) {
    throw new Error(`Command failed: ${command}\n${err.stderr ?? err.message}`)
  }
}

// Bezpieczne escapowanie argumentów (zapobiega command injection)
export function esc(value: string): string {
  if (!/^[a-zA-Z0-9._@/-]+$/.test(value)) {
    throw new Error(`Unsafe shell argument: ${value}`)
  }
  return value
}
