'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { StatCard } from '@/components/dashboard/stat-card'
import { ResourceGauge } from '@/components/dashboard/resource-gauge'
import { CpuChart } from '@/components/dashboard/cpu-chart'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatBytes, formatUptime } from '@/lib/utils'
import { useSocketStats } from '@/hooks/use-socket-stats'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import type { SystemStats } from '@overpanel/shared'
import {
  Globe,
  Database,
  Users,
  Shield,
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Cpu,
  Wifi,
  WifiOff,
} from 'lucide-react'

type ChartPoint = { time: string; cpu: number; ram: number }

interface Counts {
  sitesCount: number
  dbCount: number
  usersCount: number | null
  sslCount: number
}

interface AuditEntry {
  id: string
  action: string
  resource: string | null
  resourceId: string | null
  createdAt: string
  user: { name: string; email: string }
}

interface Site {
  id: string
  domain: string
  status: string
  phpVersion: string
  siteType: string
  hasSSL: boolean
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'site.create': 'Strona utworzona',
    'site.delete': 'Strona usunięta',
    'user.login': 'Logowanie',
    'user.logout': 'Wylogowanie',
    'db.create': 'Baza danych utworzona',
    'db.delete': 'Baza danych usunięta',
    'wordpress.install': 'WordPress zainstalowany',
    'wordpress.update': 'WordPress zaktualizowany',
    'docker.remove': 'Kontener Docker usunięty',
    'backup.create': 'Backup wykonany',
  }
  return map[action] ?? action
}

function actionStatus(action: string): 'success' | 'warning' | 'error' {
  if (action.includes('delete') || action.includes('remove')) return 'warning'
  if (action.includes('error') || action.includes('fail')) return 'error'
  return 'success'
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'przed chwilą'
  if (mins < 60) return `${mins} min temu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} godz. temu`
  return `${Math.floor(hours / 24)} dni temu`
}

// Fallback mock stats for dev without backend
function getMockStats(): SystemStats {
  return {
    cpu: Math.random() * 40 + 10,
    ram: { used: 3.2 * 1024 ** 3, total: 8 * 1024 ** 3, percent: 40 + Math.random() * 10 },
    disk: { used: 42 * 1024 ** 3, total: 100 * 1024 ** 3, percent: 42 },
    network: { rx: Math.random() * 5 * 1024 ** 2, tx: Math.random() * 2 * 1024 ** 2 },
    uptime: 1_234_567,
    loadAvg: [0.8, 1.2, 1.1],
  }
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const { stats: socketStats, connected } = useSocketStats()

  const { data: counts } = useApi<Counts>('/api/system/counts')
  const { data: sites } = useApi<Site[]>('/api/sites')
  const [activity, setActivity] = useState<AuditEntry[]>([])

  const [mockStats, setMockStats] = useState<SystemStats>(getMockStats())
  const stats = socketStats ?? mockStats

  const [history, setHistory] = useState<ChartPoint[]>([])
  const historyRef = useRef(history)
  historyRef.current = history

  // Fetch activity log (admin only)
  useEffect(() => {
    if (!isAdmin) return
    api.get<AuditEntry[]>('/api/settings/audit-log').then(setActivity).catch(() => {})
  }, [isAdmin])

  // Init history
  useEffect(() => {
    const now = Date.now()
    const initial: ChartPoint[] = Array.from({ length: 20 }, (_, i) => ({
      time: new Date(now - (19 - i) * 2000).toLocaleTimeString('pl-PL', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }),
      cpu: Math.random() * 40 + 10,
      ram: Math.random() * 20 + 35,
    }))
    setHistory(initial)
  }, [])

  // Mock fallback interval
  useEffect(() => {
    if (connected) return
    const id = setInterval(() => setMockStats(getMockStats()), 2000)
    return () => clearInterval(id)
  }, [connected])

  // Append live stats to history
  useEffect(() => {
    if (!stats) return
    const point: ChartPoint = {
      time: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      cpu: stats.cpu,
      ram: stats.ram.percent,
    }
    setHistory((prev) => [...prev.slice(-59), point])
  }, [stats])

  const recentSites = (sites ?? []).slice(0, 5)
  const recentActivity = activity.slice(0, 6)

  return (
    <div className="min-h-screen">
      <Topbar title="Dashboard" subtitle={isAdmin ? 'Przegląd serwera' : 'Twoje zasoby'} />

      <div className="p-6 space-y-6">
        {/* Connection badge — admin only */}
        {isAdmin && (
          <div className="flex items-center gap-2 text-xs">
            {connected ? (
              <span className="flex items-center gap-1.5 text-green-400">
                <Wifi className="w-3.5 h-3.5" />
                Live
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <WifiOff className="w-3.5 h-3.5" />
                Demo mode
              </span>
            )}
          </div>
        )}

        {/* Top stats */}
        <div className={`grid gap-4 ${isAdmin ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3'}`}>
          <StatCard
            title="Strony WWW"
            value={counts ? String(counts.sitesCount) : '—'}
            subtitle={counts ? `${recentSites.filter(s => s.status === 'active').length} aktywnych` : 'Ładowanie...'}
            icon={Globe}
            color="pink"
          />
          <StatCard
            title="Bazy danych"
            value={counts ? String(counts.dbCount) : '—'}
            subtitle={counts ? 'MySQL + PostgreSQL' : 'Ładowanie...'}
            icon={Database}
            color="purple"
          />
          {isAdmin && (
            <StatCard
              title="Użytkownicy"
              value={counts?.usersCount != null ? String(counts.usersCount) : '—'}
              subtitle="Klientów + adminów"
              icon={Users}
              color="blue"
            />
          )}
          <StatCard
            title="Certyfikaty SSL"
            value={counts ? String(counts.sslCount) : '—'}
            subtitle={counts && counts.sitesCount > 0
              ? `${Math.round((counts.sslCount / counts.sitesCount) * 100)}% stron zabezpieczonych`
              : 'Brak stron'
            }
            icon={Shield}
            color="green"
          />
        </div>

        {/* Charts + Resources — admin only */}
        {isAdmin && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <Card className="h-full">
                <CardHeader>
                  <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-[var(--primary)]" />
                  </div>
                  <div>
                    <CardTitle>Użycie CPU & RAM</CardTitle>
                    <p className="text-[11px] text-[var(--text-muted)]">Aktualizacja co 2 sekundy</p>
                  </div>
                  <div className="ml-auto flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#E91E8C]" />CPU
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#9B26D9]" />RAM
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <CpuChart data={history} />
                </CardContent>
              </Card>
            </div>

            <div>
              <Card className="h-full space-y-5">
                <CardHeader>
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Cpu className="w-4 h-4 text-purple-400" />
                  </div>
                  <CardTitle>Zasoby serwera</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ResourceGauge label="CPU" value={stats.cpu} detail={`${stats.loadAvg[0].toFixed(2)} avg`} color="pink" />
                  <ResourceGauge
                    label="RAM"
                    value={stats.ram.percent}
                    detail={`${formatBytes(stats.ram.used)} / ${formatBytes(stats.ram.total)}`}
                    color="purple"
                  />
                  <ResourceGauge
                    label="Dysk"
                    value={stats.disk.percent}
                    detail={`${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}`}
                    color="blue"
                  />

                  <div className="pt-2 border-t border-white/[0.06] grid grid-cols-2 gap-3">
                    <div className="glass rounded-xl p-3">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Upload</p>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{formatBytes(stats.network.tx)}/s</p>
                    </div>
                    <div className="glass rounded-xl p-3">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Download</p>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{formatBytes(stats.network.rx)}/s</p>
                    </div>
                    <div className="glass rounded-xl p-3 col-span-2">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Uptime</p>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{formatUptime(stats.uptime)}</p>
                    </div>
                  </div>

                  {/* Temperatures — admin only */}
                  {isAdmin && stats.temps?.cpu !== null && stats.temps?.cpu !== undefined && (
                    <div className="pt-2 border-t border-white/[0.06]">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Temperatury</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="glass rounded-xl p-3">
                          <p className="text-[10px] text-[var(--text-muted)] mb-0.5">CPU</p>
                          <p className={`text-sm font-semibold ${
                            stats.temps.cpu > 80 ? 'text-red-400' :
                            stats.temps.cpu > 60 ? 'text-yellow-400' :
                            'text-green-400'
                          }`}>
                            {stats.temps.cpu}°C
                          </p>
                        </div>
                        {stats.temps.max !== null && stats.temps.max !== stats.temps.cpu && (
                          <div className="glass rounded-xl p-3">
                            <p className="text-[10px] text-[var(--text-muted)] mb-0.5">Max</p>
                            <p className={`text-sm font-semibold ${
                              stats.temps.max > 80 ? 'text-red-400' :
                              stats.temps.max > 60 ? 'text-yellow-400' :
                              'text-green-400'
                            }`}>
                              {stats.temps.max}°C
                            </p>
                          </div>
                        )}
                        {stats.temps.cores.length > 0 && stats.temps.cores.map((t, i) => (
                          <div key={i} className="glass rounded-xl p-2">
                            <p className="text-[10px] text-[var(--text-muted)] mb-0.5">Core {i}</p>
                            <p className={`text-xs font-semibold ${
                              t > 80 ? 'text-red-400' : t > 60 ? 'text-yellow-400' : 'text-green-400'
                            }`}>{t}°C</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Activity + Sites */}
        <div className={`grid gap-6 ${isAdmin ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Activity — admin only */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-blue-400" />
                </div>
                <CardTitle>Ostatnia aktywność</CardTitle>
                <Link href="/settings?tab=audit" className="ml-auto text-xs text-[var(--primary)] hover:opacity-80 transition-opacity">
                  Więcej →
                </Link>
              </CardHeader>
              <CardContent className="space-y-1">
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] px-2.5 py-4">Brak aktywności.</p>
                ) : (
                  recentActivity.map((item) => {
                    const status = actionStatus(item.action)
                    return (
                      <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors">
                        {status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                        ) : status === 'warning' ? (
                          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[var(--text-primary)] font-medium truncate">{actionLabel(item.action)}</p>
                          <p className="text-xs text-[var(--text-muted)]">{item.user?.name ?? item.resource ?? '—'}</p>
                        </div>
                        <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{relativeTime(item.createdAt)}</span>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          )}

          {/* Sites */}
          <Card>
            <CardHeader>
              <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                <Globe className="w-4 h-4 text-[var(--primary)]" />
              </div>
              <CardTitle>Strony WWW</CardTitle>
              <Link href="/sites" className="ml-auto text-xs text-[var(--primary)] hover:opacity-80 transition-opacity">
                Zobacz wszystkie →
              </Link>
            </CardHeader>
            <CardContent className="space-y-1">
              {recentSites.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] px-2.5 py-4">Brak stron. Utwórz pierwszą!</p>
              ) : (
                recentSites.map((site) => (
                  <Link
                    key={site.id}
                    href="/sites"
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${site.status === 'active' ? 'bg-green-400' : site.status === 'pending' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
                    <span className="flex-1 text-sm text-[var(--text-primary)] font-medium group-hover:text-[var(--primary)] transition-colors truncate">
                      {site.domain}
                    </span>
                    <Badge variant="neutral">
                      {site.siteType === 'nodejs' ? 'Node.js' : site.siteType === 'static' ? 'HTML' : `PHP ${site.phpVersion}`}
                    </Badge>
                    {site.hasSSL ? <Badge variant="success">SSL</Badge> : <Badge variant="warning">No SSL</Badge>}
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
