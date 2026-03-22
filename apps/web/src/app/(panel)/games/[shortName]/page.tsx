'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { api } from '@/lib/api'
import { useApi } from '@/hooks/use-api'
import { formatBytes } from '@/lib/utils'
import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  Terminal,
  Settings,
  FolderOpen,
  Puzzle,
  FileText,
  Send,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Trash2,
  Search,
  Upload,
  RefreshCw,
  Gamepad2,
  ExternalLink,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServerInfo {
  shortName: string
  serverName: string
  name: string
  category: string
  steamAppId: number
  domain: string | null
  port: number
  address: string
  running: boolean
  pid?: number
}

interface ConfigData {
  gameConfig: { file: string; content: string } | null
  lgsmConfig: { file: string; content: string } | null
}

interface ModFile {
  name: string
  size: number
}

interface ModrinthResult {
  slug: string
  title: string
  description: string
  downloads: number
  icon_url: string
  project_type: string
  versions: string[]
}

interface ModrinthVersion {
  id: string
  name: string
  version_number: string
  files: { url: string; filename: string; size: number }[]
  game_versions: string[]
  loaders: string[]
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let toastCounter = 0

type Tab = 'console' | 'config' | 'files' | 'mods' | 'logs'

const TABS: { id: Tab; label: string; icon: typeof Terminal }[] = [
  { id: 'console', label: 'Konsola', icon: Terminal },
  { id: 'config', label: 'Konfiguracja', icon: Settings },
  { id: 'files', label: 'Pliki', icon: FolderOpen },
  { id: 'mods', label: 'Mody', icon: Puzzle },
  { id: 'logs', label: 'Logi', icon: FileText },
]

const MINECRAFT_SERVERS = ['mcserver', 'mcbserver', 'pmcserver']

// ── Component ─────────────────────────────────────────────────────────────────

export default function GameServerManagePage() {
  const params = useParams<{ shortName: string }>()
  const router = useRouter()
  const shortName = params.shortName as string

  const [tab, setTab] = useState<Tab>('console')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState(false)

  // Console state
  const [consoleLines, setConsoleLines] = useState<string[]>([])
  const [consoleLoading, setConsoleLoading] = useState(false)
  const [command, setCommand] = useState('')
  const [sendingCommand, setSendingCommand] = useState(false)
  const consoleEndRef = useRef<HTMLDivElement>(null)
  const consolePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Config state
  const [configData, setConfigData] = useState<ConfigData | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [activeConfigTab, setActiveConfigTab] = useState<'game' | 'lgsm'>('game')
  const [gameConfigContent, setGameConfigContent] = useState('')
  const [lgsmConfigContent, setLgsmConfigContent] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  // Mods state
  const [installedMods, setInstalledMods] = useState<ModFile[]>([])
  const [modsLoading, setModsLoading] = useState(false)
  const [modrinthSearch, setModrinthSearch] = useState('')
  const [modrinthResults, setModrinthResults] = useState<ModrinthResult[]>([])
  const [modrinthSearching, setModrinthSearching] = useState(false)
  const [installingMod, setInstallingMod] = useState<string | null>(null)
  const [deletingMod, setDeletingMod] = useState<string | null>(null)

  // Logs state
  const [logLines, setLogLines] = useState<string[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Server info
  const { data: serverInfo, loading: serverLoading, refetch: refetchServer } = useApi<ServerInfo>(
    `/api/game-servers/installed/${shortName}`
  )

  // Silently poll running status every 5s — only updates badge, no loading flicker
  const [liveRunning, setLiveRunning] = useState<boolean | null>(null)
  const [livePid, setLivePid] = useState<number | undefined>(undefined)
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await api.get<{ running: boolean; pid?: number }>(`/api/game-servers/${shortName}/status`)
        setLiveRunning(s.running)
        setLivePid(s.pid)
      } catch {}
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [shortName])

  const isMinecraft = MINECRAFT_SERVERS.includes(shortName)

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastCounter
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  // ── Server actions ──────────────────────────────────────────────────────────

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    setActionLoading(prev => ({ ...prev, [action]: true }))
    try {
      await api.post(`/api/game-servers/${shortName}/${action}`)
      addToast(
        action === 'start' ? 'Serwer uruchomiony' :
        action === 'stop' ? 'Serwer zatrzymany' :
        'Serwer zrestartowany',
        'success'
      )
      refetchServer()
    } catch (err: any) {
      addToast(err.message || 'Operacja nie powiodla sie', 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [action]: false }))
    }
  }

  const handleCopyAddress = () => {
    if (serverInfo?.address) {
      navigator.clipboard.writeText(serverInfo.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Console ─────────────────────────────────────────────────────────────────

  const fetchConsole = useCallback(async () => {
    try {
      const data = await api.get<string[]>(`/api/game-servers/${shortName}/console`)
      setConsoleLines(data)
    } catch {
      // Silently ignore
    }
  }, [shortName])

  useEffect(() => {
    if (tab === 'console') {
      setConsoleLoading(true)
      fetchConsole().finally(() => setConsoleLoading(false))
      consolePollRef.current = setInterval(fetchConsole, 2000)
    }
    return () => {
      if (consolePollRef.current) {
        clearInterval(consolePollRef.current)
        consolePollRef.current = null
      }
    }
  }, [tab, fetchConsole])

  useEffect(() => {
    if (tab === 'console') {
      consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [consoleLines, tab])

  const handleSendCommand = async () => {
    if (!command.trim()) return
    setSendingCommand(true)
    try {
      await api.post(`/api/game-servers/${shortName}/command`, { command: command.trim() })
      setCommand('')
      // Refresh console immediately
      setTimeout(fetchConsole, 500)
    } catch (err: any) {
      addToast(err.message || 'Nie udalo sie wyslac komendy', 'error')
    } finally {
      setSendingCommand(false)
    }
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true)
    try {
      const data = await api.get<ConfigData>(`/api/game-servers/${shortName}/config`)
      setConfigData(data)
      if (data.gameConfig) setGameConfigContent(data.gameConfig.content)
      if (data.lgsmConfig) setLgsmConfigContent(data.lgsmConfig.content)
    } catch (err: any) {
      addToast('Nie udalo sie zaladowac konfiguracji', 'error')
    } finally {
      setConfigLoading(false)
    }
  }, [shortName, addToast])

  useEffect(() => {
    if (tab === 'config') {
      fetchConfig()
    }
  }, [tab, fetchConfig])

  const handleSaveConfig = async () => {
    const file = activeConfigTab === 'game' ? configData?.gameConfig?.file : configData?.lgsmConfig?.file
    const content = activeConfigTab === 'game' ? gameConfigContent : lgsmConfigContent
    if (!file) return
    setSavingConfig(true)
    try {
      await api.put(`/api/game-servers/${shortName}/config`, { file, content })
      addToast('Konfiguracja zapisana', 'success')
    } catch (err: any) {
      addToast(err.message || 'Nie udalo sie zapisac konfiguracji', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  // ── Mods ────────────────────────────────────────────────────────────────────

  const fetchMods = useCallback(async () => {
    setModsLoading(true)
    try {
      const data = await api.get<ModFile[]>(`/api/game-servers/${shortName}/mods`)
      setInstalledMods(data)
    } catch {
      setInstalledMods([])
    } finally {
      setModsLoading(false)
    }
  }, [shortName])

  useEffect(() => {
    if (tab === 'mods') {
      fetchMods()
    }
  }, [tab, fetchMods])

  const handleModrinthSearch = async () => {
    if (!modrinthSearch.trim()) return
    setModrinthSearching(true)
    try {
      const res = await fetch(
        `https://api.modrinth.com/v2/search?query=${encodeURIComponent(modrinthSearch)}&facets=${encodeURIComponent('[["project_type:mod"]]')}&limit=12`
      )
      const data = await res.json()
      setModrinthResults(data.hits ?? [])
    } catch {
      addToast('Nie udalo sie wyszukac modow', 'error')
    } finally {
      setModrinthSearching(false)
    }
  }

  const handleInstallMod = async (mod: ModrinthResult) => {
    setInstallingMod(mod.slug)
    try {
      // Get latest version
      const res = await fetch(`https://api.modrinth.com/v2/project/${mod.slug}/version?limit=1`)
      const versions: ModrinthVersion[] = await res.json()
      if (!versions.length || !versions[0].files.length) {
        addToast('Brak dostepnych plikow moda', 'error')
        return
      }
      const file = versions[0].files[0]
      await api.post(`/api/game-servers/${shortName}/mods/install`, {
        url: file.url,
        filename: file.filename,
      })
      addToast(`Zainstalowano: ${mod.title}`, 'success')
      fetchMods()
    } catch (err: any) {
      addToast(err.message || 'Nie udalo sie zainstalowac moda', 'error')
    } finally {
      setInstallingMod(null)
    }
  }

  const handleDeleteMod = async (filename: string) => {
    setDeletingMod(filename)
    try {
      await api.delete(`/api/game-servers/${shortName}/mods/${encodeURIComponent(filename)}`)
      addToast(`Usunięto: ${filename}`, 'success')
      fetchMods()
    } catch (err: any) {
      addToast(err.message || 'Nie udalo sie usunac moda', 'error')
    } finally {
      setDeletingMod(null)
    }
  }

  // ── Logs ────────────────────────────────────────────────────────────────────

  const fetchLogs = useCallback(async () => {
    try {
      const data = await api.get<string[]>(`/api/game-servers/${shortName}/logs`)
      setLogLines(data)
    } catch {
      // Silently ignore
    }
  }, [shortName])

  useEffect(() => {
    if (tab === 'logs') {
      setLogsLoading(true)
      fetchLogs().finally(() => setLogsLoading(false))
      logPollRef.current = setInterval(fetchLogs, 3000)
    }
    return () => {
      if (logPollRef.current) {
        clearInterval(logPollRef.current)
        logPollRef.current = null
      }
    }
  }, [tab, fetchLogs])

  useEffect(() => {
    if (tab === 'logs') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logLines, tab])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (serverLoading) {
    return (
      <>
        <Topbar title="Serwer gry" subtitle="Ładowanie..." />
        <main className="p-6 flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[var(--primary)] animate-spin" />
        </main>
      </>
    )
  }

  if (!serverInfo) {
    return (
      <>
        <Topbar title="Serwer gry" subtitle="Nie znaleziono" />
        <main className="p-6">
          <EmptyState
            icon={Gamepad2}
            title="Serwer nie znaleziony"
            description="Ten serwer gry nie istnieje lub nie jest zainstalowany."
            action={{ label: 'Wróć do listy', onClick: () => router.push('/games') }}
          />
        </main>
      </>
    )
  }

  return (
    <>
      <Topbar
        title={serverInfo.serverName || serverInfo.name}
        subtitle="Zarządzanie serwerem gry"
      />

      <main className="p-6 space-y-6">
        {/* ── Header card ────────────────────────────────────────────────────── */}
        <Card>
          <CardContent>
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Left: back + info */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <button
                  onClick={() => router.push('/games')}
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 hover:bg-white/10 transition-all"
                >
                  <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>

                {serverInfo.steamAppId > 0 ? (
                  <img
                    src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${serverInfo.steamAppId}/capsule_sm_120.jpg`}
                    alt={serverInfo.name}
                    className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                    <Gamepad2 className="w-6 h-6 text-[var(--text-muted)]" />
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                      {serverInfo.serverName || serverInfo.name}
                    </h2>
                    <Badge variant={(liveRunning ?? serverInfo.running) ? 'success' : 'neutral'}>
                      <span className={`w-1.5 h-1.5 rounded-full ${(liveRunning ?? serverInfo.running) ? 'bg-green-400' : 'bg-gray-400'}`} />
                      {(liveRunning ?? serverInfo.running) ? 'Uruchomiony' : 'Zatrzymany'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span className="font-mono">{serverInfo.address}</span>
                    <button
                      onClick={handleCopyAddress}
                      className="hover:text-[var(--text-secondary)] transition-colors"
                      title="Kopiuj adres"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {(livePid ?? serverInfo.pid) && <span>PID: {livePid ?? serverInfo.pid}</span>}
                  </div>
                </div>
              </div>

              {/* Right: actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {!(liveRunning ?? serverInfo.running) ? (
                  <Button
                    size="sm"
                    onClick={() => handleAction('start')}
                    loading={actionLoading['start']}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Uruchom
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAction('stop')}
                      loading={actionLoading['stop']}
                    >
                      <Square className="w-3.5 h-3.5" />
                      Zatrzymaj
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAction('restart')}
                      loading={actionLoading['restart']}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restartuj
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Tab bar ────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? 'gradient-brand text-white shadow-[0_0_15px_rgba(233,30,140,0.3)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'
              }`}
            >
              <t.icon className="w-4 h-4 inline-block mr-2 -mt-0.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Console tab ────────────────────────────────────────────────────── */}
        {tab === 'console' && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Konsola serwera</h3>
                <Button size="sm" variant="ghost" onClick={fetchConsole}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Console output */}
              <div
                className="h-96 overflow-y-auto rounded-xl p-4 font-mono text-xs leading-relaxed border border-white/[0.06] mb-4"
                style={{ backgroundColor: '#0a0a0f' }}
              >
                {consoleLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
                  </div>
                ) : consoleLines.length === 0 ? (
                  <p className="text-[var(--text-muted)]">Brak danych konsoli. Serwer moze nie byc uruchomiony.</p>
                ) : (
                  consoleLines.map((line, i) => (
                    <div
                      key={i}
                      className={`whitespace-pre-wrap break-all ${
                        line.includes('ERROR') || line.includes('WARN')
                          ? line.includes('ERROR') ? 'text-red-400' : 'text-yellow-400'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {line}
                    </div>
                  ))
                )}
                <div ref={consoleEndRef} />
              </div>

              {/* Command input */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--primary)] font-mono text-sm">&gt;</span>
                  <input
                    type="text"
                    value={command}
                    onChange={e => setCommand(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendCommand()}
                    placeholder="Wpisz komende..."
                    className="w-full h-10 pl-8 pr-3 rounded-xl text-sm font-mono bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
                    disabled={!(liveRunning ?? serverInfo.running)}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleSendCommand}
                  loading={sendingCommand}
                  disabled={!(liveRunning ?? serverInfo.running) || !command.trim()}
                >
                  <Send className="w-3.5 h-3.5" />
                  Wyslij
                </Button>
              </div>
              {!(liveRunning ?? serverInfo.running) && (
                <p className="text-xs text-[var(--text-muted)] mt-2">Serwer musi byc uruchomiony, aby wysylac komendy.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Config tab ─────────────────────────────────────────────────────── */}
        {tab === 'config' && (
          <Card>
            <CardContent>
              {configLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-[var(--primary)] animate-spin" />
                </div>
              ) : (
                <>
                  {/* Config sub-tabs */}
                  <div className="flex items-center gap-2 mb-4">
                    {configData?.gameConfig && (
                      <button
                        onClick={() => setActiveConfigTab('game')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          activeConfigTab === 'game'
                            ? 'gradient-brand text-white'
                            : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-white/10'
                        }`}
                      >
                        Konfiguracja gry
                      </button>
                    )}
                    {configData?.lgsmConfig && (
                      <button
                        onClick={() => setActiveConfigTab('lgsm')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          activeConfigTab === 'lgsm'
                            ? 'gradient-brand text-white'
                            : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-white/10'
                        }`}
                      >
                        LinuxGSM
                      </button>
                    )}
                    <div className="flex-1" />
                    <Button size="sm" onClick={handleSaveConfig} loading={savingConfig}>
                      Zapisz
                    </Button>
                  </div>

                  {/* Config file path */}
                  {((activeConfigTab === 'game' && configData?.gameConfig) ||
                    (activeConfigTab === 'lgsm' && configData?.lgsmConfig)) && (
                    <p className="text-[10px] text-[var(--text-muted)] font-mono mb-2">
                      {activeConfigTab === 'game' ? configData?.gameConfig?.file : configData?.lgsmConfig?.file}
                    </p>
                  )}

                  {/* Config editor */}
                  <textarea
                    value={activeConfigTab === 'game' ? gameConfigContent : lgsmConfigContent}
                    onChange={e => {
                      if (activeConfigTab === 'game') setGameConfigContent(e.target.value)
                      else setLgsmConfigContent(e.target.value)
                    }}
                    className="w-full h-[500px] rounded-xl p-4 font-mono text-xs leading-relaxed bg-white/[0.03] border border-white/[0.06] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all resize-none"
                    style={{ tabSize: 4 }}
                    spellCheck={false}
                    placeholder="Brak pliku konfiguracyjnego"
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Files tab ──────────────────────────────────────────────────────── */}
        {tab === 'files' && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Pliki serwera</h3>
                  <p className="text-xs text-[var(--text-muted)] font-mono mt-1">/opt/game-servers/{shortName}/</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => router.push(`/files?path=${encodeURIComponent(`/opt/game-servers/${shortName}`)}`)}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Otworz w menedzerze plikow
                </Button>
              </div>
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <FolderOpen className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-[var(--text-muted)]">
                    Uzyj menedzera plikow, aby przegladac i edytowac pliki serwera.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Mods tab ───────────────────────────────────────────────────────── */}
        {tab === 'mods' && (
          <div className="space-y-6">
            {/* Installed mods */}
            <Card>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Zainstalowane mody
                    {installedMods.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-white/10">
                        {installedMods.length}
                      </span>
                    )}
                  </h3>
                  <Button size="sm" variant="ghost" onClick={fetchMods} loading={modsLoading}>
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {modsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-[var(--primary)] animate-spin" />
                  </div>
                ) : installedMods.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] py-4">Brak zainstalowanych modow.</p>
                ) : (
                  <div className="space-y-2">
                    {installedMods.map(mod => (
                      <div
                        key={mod.name}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Puzzle className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-[var(--text-primary)] truncate">{mod.name}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">{formatBytes(mod.size)}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDeleteMod(mod.name)}
                          loading={deletingMod === mod.name}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Modrinth search (Minecraft only) */}
            {isMinecraft && (
              <Card>
                <CardContent>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
                    Szukaj modow (Modrinth)
                  </h3>

                  <div className="flex items-center gap-2 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                      <input
                        type="text"
                        value={modrinthSearch}
                        onChange={e => setModrinthSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleModrinthSearch()}
                        placeholder="Szukaj modow na Modrinth..."
                        className="w-full h-10 pl-10 pr-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
                      />
                    </div>
                    <Button size="sm" onClick={handleModrinthSearch} loading={modrinthSearching}>
                      <Search className="w-3.5 h-3.5" />
                      Szukaj
                    </Button>
                  </div>

                  {modrinthResults.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {modrinthResults.map(mod => (
                        <div
                          key={mod.slug}
                          className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                        >
                          {mod.icon_url ? (
                            <img src={mod.icon_url} alt={mod.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                              <Puzzle className="w-5 h-5 text-[var(--text-muted)]" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-[var(--text-primary)] truncate">{mod.title}</h4>
                            <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 mt-0.5">{mod.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-[var(--text-muted)]">
                                {mod.downloads.toLocaleString()} pobrań
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleInstallMod(mod)}
                                loading={installingMod === mod.slug}
                              >
                                <Download className="w-3 h-3" />
                                Zainstaluj
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Upload for non-Minecraft */}
            {!isMinecraft && (
              <Card>
                <CardContent>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
                    Dodaj mody
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] mb-4">
                    Aby dodac mody, uzyj menedzera plikow i wgraj pliki do odpowiedniego katalogu modow serwera.
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => router.push(`/files?path=${encodeURIComponent(`/opt/game-servers/${shortName}/serverfiles`)}`)}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Otworz menedzer plikow
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Logs tab ───────────────────────────────────────────────────────── */}
        {tab === 'logs' && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Logi serwera</h3>
                <Button size="sm" variant="ghost" onClick={fetchLogs}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div
                className="h-[500px] overflow-y-auto rounded-xl p-4 font-mono text-xs leading-relaxed border border-white/[0.06]"
                style={{ backgroundColor: '#0a0a0f' }}
              >
                {logsLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
                  </div>
                ) : logLines.length === 0 ? (
                  <p className="text-[var(--text-muted)]">Brak danych logów.</p>
                ) : (
                  logLines.map((line, i) => (
                    <div
                      key={i}
                      className={`whitespace-pre-wrap break-all ${
                        line.includes('ERROR') || line.includes('FATAL')
                          ? 'text-red-400'
                          : line.includes('WARN')
                          ? 'text-yellow-400'
                          : line.includes('INFO')
                          ? 'text-blue-400/70'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {line}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* ── Toasts ───────────────────────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border shadow-xl backdrop-blur-xl animate-in slide-in-from-right ${
                t.type === 'success'
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              {t.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {t.message}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
