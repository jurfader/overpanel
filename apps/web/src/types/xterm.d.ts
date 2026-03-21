declare module '@xterm/xterm' {
  export interface ITheme {
    background?: string
    foreground?: string
    cursor?: string
    selectionBackground?: string
    [key: string]: string | undefined
  }

  export interface ITerminalOptions {
    theme?: ITheme
    fontFamily?: string
    fontSize?: number
    cursorBlink?: boolean
    scrollback?: number
    convertEol?: boolean
    [key: string]: unknown
  }

  export interface ITerminalAddon {
    activate(terminal: Terminal): void
    dispose(): void
  }

  export class Terminal {
    constructor(options?: ITerminalOptions)
    open(container: HTMLElement): void
    write(data: string): void
    writeln(data: string): void
    dispose(): void
    loadAddon(addon: ITerminalAddon): void
    onData(handler: (data: string) => void): void
    onResize(handler: (size: { cols: number; rows: number }) => void): void
    focus(): void
    cols: number
    rows: number
  }
}

declare module '@xterm/addon-fit' {
  import type { ITerminalAddon, Terminal } from '@xterm/xterm'
  export class FitAddon implements ITerminalAddon {
    activate(terminal: Terminal): void
    dispose(): void
    fit(): void
    proposeDimensions(): { cols: number; rows: number } | undefined
  }
}
