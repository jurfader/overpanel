'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useApi } from '@/hooks/use-api'
import { api } from '@/lib/api'
import {
  RefreshCw,
  Download,
  Search,
  ChevronDown,
  Terminal,
  Play,
  Pause,
  Globe,
  Server,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogSite {
  id: string
  domain: string
}

type LogType = 'access' | 'error' | 'system' | 'php'

const LINE_OPTIONS = [100, 200, 500, 1000] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLineColor(line: string): string {
  if (/error|Error|ERROR|crit|alert|emerg/i.test(line)) return 'text-red-400'
  if (/warn|WARN|notice/i.test(line)) return 'text-amber-400'
  if (/ 2\d\d /.test(line)) return 'text-green-400'
  if (/ 404 /.test(line)) return 'text-orange-400'
  if (/ 5\d\d /.test(line)) return 'text-red-400'
  return 'text-[var(--text-secondary)]'
}

function highlightMatch(line: string, search: string): React.ReactNode {
  if (!search) return line
  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = line.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded-sm">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TabButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
        active
          ? 'gradient-brand text-white shadow-[0_0_15px_rgba(233,30,140,0.3)]'
          : 'glass text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-white/[0.06]'
      }`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LogsPage() {
  // Fetch available sites
  const { data: sitesData, loading: sitesLoading } = useApi<LogSite[]>('/api/logs/sites')
  const sites = sitesData ?? []

  // Core state
  const [selectedSite, setSelectedSite] = useState<string>('system')
  const [logType, setLogType] = useState<LogType>('system')
  const [lines, setLines] = useState<number>(200)
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false)

  const terminalRef = useRef<HTMLDivElement>(null)
  const siteDropdownRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Derived
  const isSystem = selectedSite === 'system'
  const currentTabs: { key: LogType; label: string }[] = isSystem
    ? [
        { key: 'system', label: 'System' },
        { key: 'php', label: 'PHP 8.3' },
      ]
    : [
        { key: 'access', label: 'Access' },
        { key: 'error', label: 'Error' },
      ]

  const selectedSiteDomain = isSystem
    ? 'Logi systemowe'
    : sites.find((s) => s.id === selectedSite)?.domain ?? selectedSite

  // Filtered lines
  const filteredLines = useMemo(() => {
    if (!search.trim()) return logLines
    const lower = search.toLowerCase()
    return logLines.filter((l) => l.toLowerCase().includes(lower))
  }, [logLines, search])

  const matchCount = search.trim() ? filteredLines.length : null

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      let url = ''
      if (selectedSite === 'system') {
        url =
          logType === 'php'
            ? `/api/logs/php?version=8.3&lines=${lines}`
            : `/api/logs/system?lines=${lines}`
      } else {
        url = `/api/logs/nginx/${selectedSite}/${logType}?lines=${lines}`
      }
      const data = await api.get<{ lines: string[] }>(url)
      setLogLines(data.lines)
      setLastRefresh(new Date())
    } catch {
      // keep previous lines on error
    } finally {
      setLoading(false)
    }
  }, [selectedSite, logType, lines])

  // Fetch on dependency change
  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Auto-refresh
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 5000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [autoRefresh, fetchLogs])

  // Scroll to bottom when lines update
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logLines])

  // Close site dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(e.target as Node)) {
        setSiteDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSiteSelect(siteId: string) {
    setSelectedSite(siteId)
    if (siteId === 'system') {
      setLogType('system')
    } else {
      setLogType('access')
    }
    setSiteDropdownOpen(false)
    setSearch('')
  }

  function handleDownload() {
    const content = logLines.join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = isSystem
      ? `${logType}-${new Date().toISOString().slice(0, 10)}.log`
      : `${selectedSiteDomain}-${logType}-${new Date().toISOString().slice(0, 10)}.log`
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar title="Logi" subtitle="Nginx, PHP-FPM i systemowe" />

      <div className="p-6 flex flex-col gap-4 flex-1">

        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">

          {/* Site selector dropdown */}
          <div ref={siteDropdownRef} className="relative">
            <button
              onClick={() => setSiteDropdownOpen((v) => !v)}
              className="h-8 pl-3 pr-2.5 flex items-center gap-2 rounded-xl text-xs font-medium glass border border-white/[0.08] text-[var(--text-primary)] hover:border-white/20 transition-all"
            >
              {isSystem ? (
                <Server className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              ) : (
                <Globe className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              )}
              <span className="max-w-[160px] truncate">{selectedSiteDomain}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${
                  siteDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {siteDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 min-w-[200px] z-50 glass-card rounded-xl border border-white/[0.08] py-1 shadow-2xl shadow-black/60">
                {/* System option */}
                <button
                  onClick={() => handleSiteSelect('system')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-white/[0.05] ${
                    isSystem ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]'
                  }`}
                >
                  <Server className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)]" />
                  <span>Logi systemowe</span>
                  {isSystem && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full gradient-brand flex-shrink-0" />
                  )}
                </button>

                {/* Divider */}
                {!sitesLoading && sites.length > 0 && (
                  <div className="mx-3 my-1 border-t border-white/[0.06]" />
                )}

                {/* Site list */}
                {sitesLoading ? (
                  <div className="px-3 py-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <div className="w-3 h-3 border border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                    Ładowanie...
                  </div>
                ) : (
                  sites.map((site) => (
                    <button
                      key={site.id}
                      onClick={() => handleSiteSelect(site.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-white/[0.05] ${
                        selectedSite === site.id
                          ? 'text-[var(--primary)]'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)]" />
                      <span className="truncate">{site.domain}</span>
                      {selectedSite === site.id && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full gradient-brand flex-shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Log type tabs */}
          <div className="flex items-center gap-1.5">
            {currentTabs.map((tab) => (
              <TabButton
                key={tab.key}
                active={logType === tab.key}
                onClick={() => { setLogType(tab.key); setSearch('') }}
              >
                {tab.label}
              </TabButton>
            ))}
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-white/[0.08] hidden sm:block" />

          {/* Lines selector */}
          <div className="flex items-center gap-1">
            {LINE_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setLines(n)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  lines === n
                    ? 'bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Right side actions */}
          <div className="ml-auto flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              title={autoRefresh ? 'Wyłącz auto-odświeżanie' : 'Włącz auto-odświeżanie (co 5s)'}
              className={`h-8 px-3 flex items-center gap-1.5 rounded-xl text-xs font-medium border transition-all ${
                autoRefresh
                  ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'
                  : 'glass border-white/[0.08] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-white/20'
              }`}
            >
              {autoRefresh ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{autoRefresh ? 'Auto' : 'Auto'}</span>
              {autoRefresh && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              )}
            </button>

            {/* Manual refresh */}
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchLogs}
              loading={loading}
              title="Odśwież logi"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>

            {/* Download */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              disabled={logLines.length === 0}
              title="Pobierz log jako plik .txt"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Search bar ──────────────────────────────────────────────── */}
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtruj linie..."
            className="w-full h-9 pl-10 pr-4 rounded-xl text-sm font-mono glass border border-white/[0.08] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
          />
          {matchCount !== null && (
            <div className="absolute right-3.5 flex items-center gap-1.5">
              <Badge variant={matchCount > 0 ? 'success' : 'neutral'}>
                {matchCount} {matchCount === 1 ? 'wynik' : 'wyniki/ów'}
              </Badge>
            </div>
          )}
        </div>

        {/* ── Terminal output ──────────────────────────────────────────── */}
        <Card className="p-0 overflow-hidden flex-1 flex flex-col border border-white/[0.06]">
          {/* Terminal titlebar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02] flex-shrink-0">
            {/* Traffic-light dots */}
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/60" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <span className="w-3 h-3 rounded-full bg-green-500/60" />
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono">
              <Terminal className="w-3.5 h-3.5" />
              <span>
                {selectedSiteDomain}
                {' '}
                <span className="text-[var(--text-muted)]/60">·</span>
                {' '}
                {currentTabs.find((t) => t.key === logType)?.label ?? logType}
              </span>
            </div>
            {loading && (
              <div className="ml-auto flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                <div className="w-3 h-3 border border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                Ładowanie...
              </div>
            )}
          </div>

          {/* Log lines */}
          <div
            ref={terminalRef}
            className="flex-1 overflow-y-auto font-mono text-xs leading-5 bg-black/40 p-4 scroll-smooth"
            style={{ maxHeight: 'calc(100vh - 320px)', minHeight: '240px' }}
          >
            {!loading && filteredLines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 py-16 text-[var(--text-muted)]">
                <Terminal className="w-10 h-10 opacity-20" />
                <p className="text-sm">Brak logów</p>
                {search && (
                  <p className="text-xs opacity-60">
                    Brak wyników dla frazy &quot;{search}&quot;
                  </p>
                )}
              </div>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {filteredLines.map((line, idx) => {
                    const color = getLineColor(line)
                    return (
                      <tr
                        key={idx}
                        className="group hover:bg-white/[0.03] transition-colors"
                      >
                        {/* Line number */}
                        <td className="select-none pr-4 text-right text-[var(--text-muted)]/40 w-12 align-top pt-px group-hover:text-[var(--text-muted)]/70 transition-colors">
                          {idx + 1}
                        </td>
                        {/* Line content */}
                        <td className={`break-all align-top ${color}`}>
                          {search ? highlightMatch(line, search) : line}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer bar */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.06] bg-white/[0.01] flex-shrink-0">
            <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] font-mono">
              <span>
                Wyświetlono{' '}
                <span className="text-[var(--text-secondary)]">{filteredLines.length}</span>
                {search && logLines.length !== filteredLines.length && (
                  <span className="text-[var(--text-muted)]/60"> / {logLines.length}</span>
                )}{' '}
                linii
              </span>
              {autoRefresh && (
                <span className="flex items-center gap-1 text-green-500/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  auto co 5s
                </span>
              )}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] font-mono">
              {lastRefresh ? (
                <span>
                  Ostatnie odświeżenie:{' '}
                  <span className="text-[var(--text-secondary)]">{formatTime(lastRefresh)}</span>
                </span>
              ) : (
                <span className="opacity-50">—</span>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
