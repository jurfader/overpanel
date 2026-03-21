'use client'

import { useEffect, useRef, useState } from 'react'
import '@xterm/xterm/css/xterm.css'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth'
import { TerminalIcon, RefreshCw, X, Maximize2, Minimize2 } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''
const SOCKET_URL = API_URL

export default function TerminalPage() {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<import('@xterm/xterm').Terminal | null>(null)
  const socketRef = useRef<import('socket.io-client').Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [fullscreen, setFullscreen] = useState(false)

  // Redirect non-admins
  if (user && user.role !== 'admin') {
    return (
      <div className="min-h-screen">
        <Topbar title="Terminal" subtitle="Dostęp ograniczony" />
        <div className="p-6">
          <Card className="p-6 text-center">
            <p className="text-[var(--text-muted)]">Terminal dostępny tylko dla administratorów.</p>
          </Card>
        </div>
      </div>
    )
  }

  const connect = async () => {
    setError('')

    // Cleanup previous session
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    try {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { io } = await import('socket.io-client')

      // Destroy previous terminal instance
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
      }

      const term = new Terminal({
        theme: {
          background: '#0a0a0f',
          foreground: '#e2e8f0',
          cursor: '#E91E8C',
          cursorAccent: '#0a0a0f',
          black: '#1a1a2e',
          red: '#ff5555',
          green: '#50fa7b',
          yellow: '#f1fa8c',
          blue: '#9B26D9',
          magenta: '#E91E8C',
          cyan: '#8be9fd',
          white: '#e2e8f0',
          brightBlack: '#44475a',
          brightRed: '#ff6e6e',
          brightGreen: '#69ff94',
          brightYellow: '#ffffa5',
          brightBlue: '#d6acff',
          brightMagenta: '#ff92df',
          brightCyan: '#a4ffff',
          brightWhite: '#ffffff',
        },
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: 'bar',
        allowProposedApi: true,
        scrollback: 5000,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)

      if (termRef.current) {
        term.open(termRef.current)
        fitAddon.fit()
      }

      xtermRef.current = term

      // Connect to terminal namespace
      const socket = io(`${SOCKET_URL}/terminal`, {
        auth: { token },
        query: {
          cols: term.cols,
          rows: term.rows,
        },
        transports: ['polling', 'websocket'],
        upgrade: true,
      })

      socketRef.current = socket

      socket.on('connect', () => {
        setConnected(true)
        term.focus()
      })

      socket.on('disconnect', () => {
        setConnected(false)
        term.writeln('\r\n\x1b[33m[Połączenie zamknięte]\x1b[0m')
      })

      socket.on('connect_error', (err) => {
        setError(err.message)
        setConnected(false)
      })

      socket.on('data', (data: string) => {
        term.write(data)
      })

      socket.on('exit', (code: number) => {
        term.writeln(`\r\n\x1b[33m[Sesja zakończona — kod: ${code}]\x1b[0m`)
        setConnected(false)
      })

      // Terminal input → socket
      term.onData((data) => {
        socket.emit('input', data)
      })

      // Resize
      term.onResize(({ cols, rows }) => {
        socket.emit('resize', { cols, rows })
      })

      // Handle window resize
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit()
      })
      if (termRef.current) resizeObserver.observe(termRef.current)

      // Cleanup on component unmount
      return () => {
        resizeObserver.disconnect()
      }
    } catch (err: any) {
      setError(err?.message ?? 'Błąd inicjalizacji terminala')
    }
  }

  const disconnect = () => {
    socketRef.current?.disconnect()
    socketRef.current = null
    setConnected(false)
  }

  useEffect(() => {
    connect()
    return () => {
      socketRef.current?.disconnect()
      xtermRef.current?.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`${fullscreen ? 'fixed inset-0 z-50 bg-[#0a0a0f]' : 'min-h-screen'}`}>
      {!fullscreen && (
        <Topbar title="Terminal" subtitle="Bezpośredni dostęp do powłoki serwera" />
      )}

      <div className={`${fullscreen ? 'h-full flex flex-col' : 'p-6'} space-y-4`}>
        {/* Toolbar */}
        <div className={`flex items-center gap-3 flex-wrap ${fullscreen ? 'px-4 pt-4 flex-shrink-0' : ''}`}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <Badge variant={connected ? 'success' : 'danger'}>
              {connected ? 'Połączony' : 'Rozłączony'}
            </Badge>
          </div>

          {error && (
            <span className="text-xs text-red-400 truncate max-w-xs">{error}</span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={connect}
              title="Nowa sesja"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">Nowa sesja</span>
            </Button>
            {connected && (
              <Button
                variant="danger"
                size="sm"
                onClick={disconnect}
                title="Rozłącz"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Tryb normalny' : 'Pełny ekran'}
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Warning banner */}
        {!fullscreen && (
          <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm flex items-start gap-3">
            <TerminalIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Terminal działa jako <strong>root</strong>. Wszelkie zmiany są natychmiastowe i nieodwracalne. Używaj ostrożnie.
            </span>
          </div>
        )}

        {/* Terminal container */}
        <Card
          className={`p-0 overflow-hidden border border-white/10 ${fullscreen ? 'flex-1 rounded-none border-0' : ''}`}
          style={{ background: '#0a0a0f' }}
        >
          {/* Traffic lights */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
            <span className="ml-3 text-xs text-[var(--text-muted)] font-mono">bash — overpanel terminal</span>
          </div>

          {/* xterm.js mount point */}
          <div
            ref={termRef}
            className={`${fullscreen ? 'h-[calc(100vh-8rem)]' : 'h-[520px]'} w-full`}
            style={{ padding: '8px' }}
          />
        </Card>
      </div>

      {/* xterm CSS - loaded dynamically */}
      <style>{`
        .xterm { height: 100%; }
        .xterm-viewport { scrollbar-width: thin; scrollbar-color: rgba(233,30,140,0.3) transparent; }
      `}</style>
    </div>
  )
}
