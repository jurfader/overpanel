'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { api } from '@/lib/api'
import { useApi } from '@/hooks/use-api'
import {
  Gamepad2,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Search,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Server,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameServerTemplate {
  id: string
  name: string
  shortName: string
  category: string
  defaultPort: number
  protocol: string
  installed: boolean
}

interface InstalledServer {
  shortName: string
  serverName: string
  name: string
  category: string
  domain: string | null
  port: number
  address: string
  running: boolean
  pid?: number
}

interface InstallStatus {
  status: 'running' | 'success' | 'failed'
  step: string
  log: string[]
  startedAt: string
  completedAt?: string
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let toastCounter = 0

const CATEGORIES = ['Wszystkie', 'FPS', 'Survival', 'Sandbox', 'RPG', 'VoIP', 'Inne'] as const

function getCategoryColor(cat: string): 'info' | 'success' | 'warning' | 'brand' | 'error' | 'neutral' {
  const map: Record<string, 'info' | 'success' | 'warning' | 'brand' | 'error' | 'neutral'> = {
    FPS: 'error',
    Survival: 'success',
    Sandbox: 'warning',
    RPG: 'brand',
    VoIP: 'info',
    Inne: 'neutral',
  }
  return map[cat] ?? 'neutral'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GameServersPage() {
  const [tab, setTab] = useState<'servers' | 'catalog'>('servers')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  // Catalog state
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('Wszystkie')

  // Install modal — 2 steps: config form → progress terminal
  const [installTarget, setInstallTarget] = useState<GameServerTemplate | null>(null)
  const [installPhase, setInstallPhase] = useState<'config' | 'progress'>('config')
  const [installLog, setInstallLog] = useState<string[]>([])
  const [installStatus, setInstallStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle')
  const [installStep, setInstallStep] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Install form fields
  const [formServerName, setFormServerName] = useState('')
  const [formDomain, setFormDomain] = useState('')
  const [formPort, setFormPort] = useState('')
  const [formMaxPlayers, setFormMaxPlayers] = useState('')
  const [formPassword, setFormPassword] = useState('')

  // Confirm uninstall modal
  const [uninstallTarget, setUninstallTarget] = useState<InstalledServer | null>(null)

  // Data fetching
  const { data: templates, loading: templatesLoading, refetch: refetchTemplates } = useApi<GameServerTemplate[]>('/api/game-servers')
  const { data: installed, loading: installedLoading, refetch: refetchInstalled } = useApi<InstalledServer[]>('/api/game-servers/installed')

  // Auto-scroll install log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [installLog])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastCounter
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleAction = async (shortName: string, action: 'start' | 'stop' | 'restart') => {
    const key = `${shortName}-${action}`
    setActionLoading(prev => ({ ...prev, [key]: true }))
    try {
      await api.post(`/api/game-servers/${shortName}/${action}`)
      addToast(
        action === 'start' ? 'Serwer uruchomiony' :
        action === 'stop' ? 'Serwer zatrzymany' :
        'Serwer zrestartowany',
        'success'
      )
      refetchInstalled()
    } catch (err: any) {
      addToast(err.message || 'Operacja nie powiodla sie', 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleUninstall = async (shortName: string) => {
    setUninstallTarget(null)
    setActionLoading(prev => ({ ...prev, [`${shortName}-uninstall`]: true }))
    try {
      await api.delete(`/api/game-servers/${shortName}`)
      addToast('Serwer odinstalowany', 'success')
      refetchInstalled()
      refetchTemplates()
    } catch (err: any) {
      addToast(err.message || 'Odinstalowanie nie powiodlo sie', 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [`${shortName}-uninstall`]: false }))
    }
  }

  const handleInstall = (template: GameServerTemplate) => {
    setInstallTarget(template)
    setInstallPhase('config')
    setInstallStatus('idle')
    setFormServerName(template.name)
    setFormDomain('')
    setFormPort(String(template.defaultPort))
    setFormMaxPlayers('')
    setFormPassword('')
  }

  const handleStartInstall = async () => {
    if (!installTarget) return
    setInstallPhase('progress')
    setInstallLog(['Rozpoczynanie instalacji...'])
    setInstallStatus('running')
    setInstallStep('')

    const body: Record<string, unknown> = { shortName: installTarget.shortName }
    if (formServerName) body.serverName = formServerName
    if (formDomain) body.domain = formDomain
    if (formPort) body.port = parseInt(formPort, 10)
    if (formMaxPlayers) body.maxPlayers = parseInt(formMaxPlayers, 10)
    if (formPassword) body.password = formPassword

    try {
      await api.post('/api/game-servers/install', body)
    } catch (err: any) {
      setInstallLog(['Blad: ' + (err.message || 'Nie mozna uruchomic instalacji')])
      setInstallStatus('failed')
      return
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<InstallStatus | null>(`/api/game-servers/install-status/${installTarget.shortName}`)
        if (res) {
          setInstallLog(res.log)
          setInstallStep(res.step)
          if (res.status === 'success' || res.status === 'failed') {
            setInstallStatus(res.status)
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            if (res.status === 'success') {
              refetchInstalled()
              refetchTemplates()
            }
          }
        }
      } catch {}
    }, 2000)
  }

  const handleCloseInstallModal = () => {
    if (installStatus === 'running') return
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setInstallTarget(null)
    setInstallLog([])
    setInstallStatus('idle')
    setInstallStep('')
  }

  // ── Filters ─────────────────────────────────────────────────────────────────

  const filteredTemplates = (templates ?? []).filter(t => {
    if (categoryFilter !== 'Wszystkie' && t.category !== categoryFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q)
    }
    return true
  })

  const installedServers = installed ?? []

  return (
    <>
      <Topbar title="Serwery gier" subtitle="Zarządzanie serwerami gier przez LinuxGSM" />

      <main className="p-6 space-y-6">
        {/* Tab bar */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
          <button
            onClick={() => setTab('servers')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'servers'
                ? 'gradient-brand text-white shadow-[0_0_15px_rgba(233,30,140,0.3)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'
            }`}
          >
            <Server className="w-4 h-4 inline-block mr-2 -mt-0.5" />
            Serwery
            {installedServers.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-white/10">
                {installedServers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('catalog')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'catalog'
                ? 'gradient-brand text-white shadow-[0_0_15px_rgba(233,30,140,0.3)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'
            }`}
          >
            <Gamepad2 className="w-4 h-4 inline-block mr-2 -mt-0.5" />
            Katalog
          </button>
        </div>

        {/* ── Servers tab ────────────────────────────────────────────────────── */}
        {tab === 'servers' && (
          <>
            {installedLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-[var(--primary)] animate-spin" />
              </div>
            ) : installedServers.length === 0 ? (
              <EmptyState
                icon={Gamepad2}
                title="Brak zainstalowanych serwerow"
                description="Przejdz do katalogu, aby zainstalowac swoj pierwszy serwer gry."
                action={{ label: 'Przejdz do katalogu', onClick: () => setTab('catalog') }}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {installedServers.map(server => (
                  <Card key={server.shortName} className="group hover:border-white/15 transition-all">
                    <CardContent>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            server.running
                              ? 'bg-green-500/10 border border-green-500/20'
                              : 'bg-white/5 border border-white/10'
                          }`}>
                            <Gamepad2 className={`w-5 h-5 ${server.running ? 'text-green-400' : 'text-[var(--text-muted)]'}`} />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{server.serverName || server.name}</h3>
                            <p className="text-xs text-[var(--text-muted)] font-mono">{server.address}</p>
                          </div>
                        </div>
                        <Badge variant={server.running ? 'success' : 'neutral'}>
                          <span className={`w-1.5 h-1.5 rounded-full ${server.running ? 'bg-green-400' : 'bg-gray-400'}`} />
                          {server.running ? 'Uruchomiony' : 'Zatrzymany'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant={getCategoryColor(server.category)}>{server.category}</Badge>
                        {server.pid && (
                          <span className="text-[10px] text-[var(--text-muted)]">PID: {server.pid}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!server.running ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAction(server.shortName, 'start')}
                            loading={actionLoading[`${server.shortName}-start`]}
                          >
                            <Play className="w-3.5 h-3.5" />
                            Uruchom
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleAction(server.shortName, 'stop')}
                              loading={actionLoading[`${server.shortName}-stop`]}
                            >
                              <Square className="w-3.5 h-3.5" />
                              Zatrzymaj
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAction(server.shortName, 'restart')}
                              loading={actionLoading[`${server.shortName}-restart`]}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        <div className="flex-1" />
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setUninstallTarget(server)}
                          loading={actionLoading[`${server.shortName}-uninstall`]}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Catalog tab ────────────────────────────────────────────────────── */}
        {tab === 'catalog' && (
          <>
            {/* Search + category filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Szukaj serwera..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full h-10 pl-10 pr-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
                />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      categoryFilter === cat
                        ? 'gradient-brand text-white'
                        : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {templatesLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-[var(--primary)] animate-spin" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Brak wynikow"
                description="Zmien filtry lub wyszukiwana fraze."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTemplates.map(template => (
                  <Card
                    key={template.id}
                    className={`group hover:border-white/15 transition-all ${template.installed ? 'opacity-70' : ''}`}
                  >
                    <CardContent>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                          <Gamepad2 className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{template.name}</h3>
                          <p className="text-[11px] text-[var(--text-muted)]">{template.shortName}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <Badge variant={getCategoryColor(template.category)}>{template.category}</Badge>
                        {template.installed ? (
                          <Badge variant="success">
                            <CheckCircle2 className="w-3 h-3" />
                            Zainstalowany
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleInstall(template)}
                          >
                            <Download className="w-3.5 h-3.5" />
                            Zainstaluj
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Install modal (config form → progress) ─────────────────────────── */}
      {installTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={installPhase === 'config' || installStatus !== 'running' ? handleCloseInstallModal : undefined} />
          <div className="relative glass-card rounded-2xl border border-white/10 shadow-2xl w-full max-w-[600px] flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  {installPhase === 'config' ? 'Konfiguracja serwera' : 'Instalacja'}: {installTarget.name}
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{installTarget.shortName}</p>
              </div>
              {(installPhase === 'config' || installStatus !== 'running') && (
                <button onClick={handleCloseInstallModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-all">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {installPhase === 'config' ? (
                /* ── Config form ──────────────────────────────────────── */
                <>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Nazwa serwera</label>
                      <input className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all" value={formServerName} onChange={e => setFormServerName(e.target.value)} placeholder="Mój serwer" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Subdomena (opcjonalna)</label>
                      <input className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all" value={formDomain} onChange={e => setFormDomain(e.target.value.toLowerCase())} placeholder="mc.twojadomena.pl" />
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">Rekord DNS A (szara chmurka, bez proxy) zostanie utworzony automatycznie w Cloudflare</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Port ({installTarget.protocol.toUpperCase()})</label>
                        <input type="number" className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all" value={formPort} onChange={e => setFormPort(e.target.value)} />
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">Port zostanie automatycznie otwarty w firewall</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Max graczy</label>
                        <input type="number" className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all" value={formMaxPlayers} onChange={e => setFormMaxPlayers(e.target.value)} placeholder="32" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Hasło serwera (opcjonalne)</label>
                      <input type="password" className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all" value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder="Zostaw puste dla publicznego serwera" />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl gradient-subtle border border-[var(--primary)]/15 text-xs text-[var(--text-muted)] space-y-1">
                    <p className="font-medium text-[var(--text-secondary)]">Co zostanie wykonane automatycznie:</p>
                    <p>• Instalacja serwera <code className="text-[var(--primary)]">{installTarget.name}</code> via LinuxGSM</p>
                    <p>• Otwarcie portu <code className="text-[var(--primary)]">{formPort || installTarget.defaultPort}</code> w firewall (UFW)</p>
                    {formDomain && <p>• Rekord DNS A: <code className="text-[var(--primary)]">{formDomain}</code> → IP serwera (bez proxy)</p>}
                    <p>• Adres: <code className="text-[var(--primary)]">{formDomain || '<IP>'}{':'}{formPort || installTarget.defaultPort}</code></p>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={handleCloseInstallModal}>Anuluj</Button>
                    <Button className="flex-1" onClick={handleStartInstall}>
                      <Download className="w-4 h-4" /> Zainstaluj serwer
                    </Button>
                  </div>
                </>
              ) : (
                /* ── Progress terminal ────────────────────────────────── */
                <>
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${installStatus === 'running' ? 'bg-amber-400 animate-pulse' : installStatus === 'success' ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-sm font-medium text-[var(--text-secondary)]">
                      {installStatus === 'running' ? installStep || 'Uruchamianie...' : installStatus === 'success' ? 'Instalacja zakonczona' : 'Instalacja nieudana'}
                    </span>
                    {installStatus === 'running' && <Loader2 className="w-4 h-4 text-amber-400 animate-spin ml-auto" />}
                  </div>

                  <div className="h-80 overflow-y-auto rounded-xl p-4 font-mono text-xs leading-relaxed border border-white/[0.06]" style={{ backgroundColor: '#0a0a0f' }}>
                    {installLog.map((line, i) => (
                      <div key={i} className={`whitespace-pre-wrap break-all ${line.startsWith('\u2713') ? 'text-green-400' : line.startsWith('\u2717') ? 'text-red-400' : line.startsWith('>') ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}>{line}</div>
                    ))}
                    <div ref={logEndRef} />
                  </div>

                  {installStatus === 'success' && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
                      <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-400">Serwer zainstalowany!</p>
                        <p className="text-xs text-green-400/70 mt-0.5">Adres: <code>{formDomain || '<IP>'}{':'}{formPort || installTarget.defaultPort}</code></p>
                      </div>
                    </div>
                  )}
                  {installStatus === 'failed' && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm font-medium text-red-400">Instalacja nie powiodla sie.</p>
                    </div>
                  )}
                  {installStatus !== 'running' && (
                    <div className="flex justify-end pt-1"><Button onClick={handleCloseInstallModal}>Zamknij</Button></div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Uninstall confirm modal ──────────────────────────────────────────── */}
      {uninstallTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setUninstallTarget(null)} />
          <div className="relative glass-card rounded-2xl border border-white/10 shadow-2xl w-full max-w-sm">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Odinstaluj serwer</h3>
                  <p className="text-xs text-[var(--text-muted)]">{uninstallTarget.name}</p>
                </div>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Czy na pewno chcesz odinstalowac serwer <strong>{uninstallTarget.name}</strong>? Wszystkie pliki gry zostana usuniete.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setUninstallTarget(null)}>
                  Anuluj
                </Button>
                <Button variant="danger" className="flex-1" onClick={() => handleUninstall(uninstallTarget.shortName)}>
                  Odinstaluj
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
