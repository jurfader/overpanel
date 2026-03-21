declare module 'node-pty' {
  export interface IPty {
    pid: number
    process: string
    write(data: string): void
    resize(cols: number, rows: number): void
    kill(signal?: string): void
    onData(cb: (data: string) => void): void
    onExit(cb: (e: { exitCode: number; signal?: number }) => void): void
  }

  export interface IBasePtyForkOptions {
    name?: string
    cols?: number
    rows?: number
    cwd?: string
    env?: Record<string, string>
  }

  export function spawn(
    file: string,
    args: string[],
    options: IBasePtyForkOptions,
  ): IPty
}
