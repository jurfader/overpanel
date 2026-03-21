'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/store/auth'
import {
  Globe,
  Database,
  HardDrive,
  User,
  Download,
  FolderOpen,
  Shield,
  FileArchive,
  Server,
  AlertCircle,
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Site {
  id: string
  domain: string
  status: 'active' | 'inactive' | 'pending'
  phpVersion: string
  hasSSL: boolean
  hasWordpress: boolean
  diskUsageMb: number
}

interface Db {
  id: string
  name: string
  engine: 'mysql' | 'postgresql'
  sizeMb: number
}

interface BackupRecord {
  id: string
  type: 'files' | 'database' | 'full'
  status: 'pending' | 'running' | 'success' | 'failed'
  sizeMb: number
  path: string | null
  createdAt: string
}

interface FtpUser {
  id: string
  username: string
  homeDir: string
  isActive: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(mb: number): string {
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL') + ' ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

function StatusDot({ status }: { status: Site['status'] }) {
  const colors: Record<Site['status'], string> = {
    active: 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]',
    inactive: 'bg-red-400',
    pending: 'bg-yellow-400',
  }
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status]}`} />
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClientPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  // Admins shouldn't see this page
  useEffect(() => {
    if (user && user.role === 'admin') {
      router.replace('/dashboard')
    }
  }, [user, router])

  const { data: sites, loading: sitesLoading } = useApi<Site[]>('/api/sites')
  const { data: dbs, loading: dbsLoading } = useApi<Db[]>('/api/databases')
  const { data: backups, loading: backupsLoading } = useApi<BackupRecord[]>('/api/backups')
  const { data: ftpUsers, loading: ftpLoading } = useApi<FtpUser[]>('/api/ftp')

  if (user?.role === 'admin') {
    return (
      <div className="min-h-screen">
        <Topbar title="Panel klienta" subtitle="Twoje zasoby" />
        <div className="p-6">
          <Card className="flex flex-col items-center gap-3 py-10">
            <AlertCircle className="w-8 h-8 text-[var(--primary)]" />
            <p className="text-sm text-[var(--text-muted)]">Administratorzy są przekierowywani do /dashboard</p>
            <Button size="sm" onClick={() => router.push('/dashboard')}>Przejdź do Dashboard</Button>
          </Card>
        </div>
      </div>
    )
  }

  const latestBackup = (backups ?? []).filter((b) => b.status === 'success').sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0] ?? null

  return (
    <div className="min-h-screen">
      <Topbar title="Panel klienta" subtitle="Twoje zasoby" />

      <div className="p-6 space-y-6">

        {/* Welcome */}
        <div className="glass-card rounded-2xl p-5 border border-white/[0.08] gradient-subtle">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl gradient-brand flex items-center justify-center text-white text-lg font-bold glow-pink flex-shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Witaj, {user?.name ?? 'Użytkowniku'}!
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Przegląd Twoich zasobów hostingowych
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ── Sites ── */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[var(--primary)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Twoje strony</h3>
              </div>
              <Badge variant="neutral">{(sites ?? []).length}</Badge>
            </div>

            {sitesLoading ? (
              <div className="py-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (sites ?? []).length === 0 ? (
              <EmptyState icon={Globe} title="Brak stron" description="Brak przypisanych stron" />
            ) : (
              <div>
                {(sites ?? []).map((site) => (
                  <div
                    key={site.id}
                    className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <StatusDot status={site.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{site.domain}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant="neutral" className="text-[10px]">PHP {site.phpVersion}</Badge>
                        {site.hasWordpress && <Badge variant="info" className="text-[10px]">WordPress</Badge>}
                        {site.hasSSL && (
                          <span className="flex items-center gap-1 text-[10px] text-green-400">
                            <Shield className="w-3 h-3" /> SSL
                          </span>
                        )}
                        {site.diskUsageMb > 0 && (
                          <span className="text-[10px] text-[var(--text-muted)]">{formatBytes(site.diskUsageMb)}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Menedżer plików"
                      onClick={() => router.push('/files')}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── Databases ── */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[var(--secondary)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Bazy danych</h3>
              </div>
              <Badge variant="neutral">{(dbs ?? []).length}</Badge>
            </div>

            {dbsLoading ? (
              <div className="py-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (dbs ?? []).length === 0 ? (
              <EmptyState icon={Database} title="Brak baz danych" description="Brak przypisanych baz danych" />
            ) : (
              <div>
                {(dbs ?? []).map((db) => (
                  <div
                    key={db.id}
                    className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      db.engine === 'mysql' ? 'bg-orange-500/10' : 'bg-blue-500/10'
                    }`}>
                      <Database className={`w-3.5 h-3.5 ${db.engine === 'mysql' ? 'text-orange-400' : 'text-blue-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{db.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={db.engine === 'mysql' ? 'warning' : 'info'} className="text-[10px]">
                          {db.engine === 'mysql' ? 'MySQL' : 'PostgreSQL'}
                        </Badge>
                        {db.sizeMb > 0 && (
                          <span className="text-[10px] text-[var(--text-muted)]">{formatBytes(db.sizeMb)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── Backup ── */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ostatni backup</h3>
              </div>
            </div>

            {backupsLoading ? (
              <div className="py-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !latestBackup ? (
              <EmptyState icon={FileArchive} title="Brak backupów" description="Nie wykonano jeszcze żadnego backupu" />
            ) : (
              <div className="px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-green-400/10 flex items-center justify-center flex-shrink-0">
                    <FileArchive className="w-5 h-5 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] capitalize">{latestBackup.type}</p>
                    <p className="text-xs text-[var(--text-muted)]">{formatDate(latestBackup.createdAt)}</p>
                    <p className="text-xs text-[var(--text-muted)]">{formatBytes(latestBackup.sizeMb)}</p>
                  </div>
                  {latestBackup.path && (
                    <a
                      href={`${API_URL}/api/backups/${latestBackup.id}/download`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium glass border border-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                    >
                      <Download className="w-3.5 h-3.5" /> Pobierz
                    </a>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* ── FTP ── */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Konta FTP</h3>
              </div>
              <Badge variant="neutral">{(ftpUsers ?? []).length}</Badge>
            </div>

            {ftpLoading ? (
              <div className="py-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (ftpUsers ?? []).length === 0 ? (
              <EmptyState icon={User} title="Brak kont FTP" description="Brak skonfigurowanych kont FTP" />
            ) : (
              <div>
                {(ftpUsers ?? []).map((ftp) => (
                  <div
                    key={ftp.id}
                    className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] font-mono truncate">{ftp.username}</p>
                      <p className="text-xs text-[var(--text-muted)] font-mono truncate">{ftp.homeDir}</p>
                    </div>
                    <Badge variant={ftp.isActive ? 'success' : 'error'} className="text-[10px]">
                      {ftp.isActive ? 'Aktywne' : 'Nieaktywne'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  )
}
