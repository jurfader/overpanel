'use client'

import { useState, useEffect, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/dashboard/stat-card'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/store/auth'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { Site, Database } from '@overpanel/shared'
import {
  HardDrive,
  FileArchive,
  Database as DbIcon,
  Plus,
  RefreshCw,
  Trash2,
  Download,
  Archive,
  Clock,
  RotateCcw,
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

interface BackupFile {
  filename: string
  path: string
  sizeMb: number
  createdAt: string | Date
  type: 'files' | 'database' | 'full'
  domain?: string
}

interface BackupRecord {
  id: string
  type: 'files' | 'database' | 'full'
  status: 'pending' | 'running' | 'success' | 'failed'
  sizeMb: number
  path: string | null
  errorMsg: string | null
  createdAt: string
  siteId: string | null
}

function formatSize(sizeMb: number): string {
  if (sizeMb < 1024) return `${sizeMb.toFixed(1)} MB`
  return `${(sizeMb / 1024).toFixed(1)} GB`
}

function formatBackupDate(date: string | Date): string {
  const d = new Date(date)
  return (
    d.toLocaleDateString('pl-PL') +
    ' ' +
    d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  )
}

function TypeIcon({ type }: { type: BackupFile['type'] }) {
  if (type === 'files') return <FileArchive className="w-4 h-4 text-blue-400" />
  if (type === 'database') return <DbIcon className="w-4 h-4 text-green-400" />
  return <HardDrive className="w-4 h-4 text-[var(--primary)]" />
}

function TypeBadge({ type }: { type: BackupFile['type'] }) {
  if (type === 'files')
    return <Badge variant="info">Pliki</Badge>
  if (type === 'database')
    return <Badge variant="success">Baza danych</Badge>
  return <Badge variant="brand">Pełny</Badge>
}

interface CreateBackupModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function CreateBackupModal({ open, onClose, onSuccess }: CreateBackupModalProps) {
  const { data: sites } = useApi<Site[]>('/api/sites')
  const { data: databases } = useApi<Database[]>('/api/databases')
  const [form, setForm] = useState({ siteId: '', type: 'files', databaseId: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const showDbSelect = form.type === 'database' || form.type === 'full'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.siteId) return setError('Wybierz stronę')
    setLoading(true)
    try {
      await api.post('/api/backups', {
        siteId: form.siteId,
        type: form.type,
        databaseId: form.databaseId || undefined,
      })
      onSuccess()
      onClose()
      setForm({ siteId: '', type: 'files', databaseId: '' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas tworzenia backupu')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setForm({ siteId: '', type: 'files', databaseId: '' })
    setError('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Utwórz backup"
      description="Wybierz stronę i typ kopii zapasowej"
      size="sm"
    >
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Strona"
          value={form.siteId}
          onChange={(e) => set('siteId', e.target.value)}
          required
        >
          <option value="">Wybierz stronę...</option>
          {(sites ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.domain}
            </option>
          ))}
        </Select>

        <Select
          label="Typ backupu"
          value={form.type}
          onChange={(e) => set('type', e.target.value)}
        >
          <option value="files">Pliki (tar.gz)</option>
          <option value="database">Baza danych (SQL)</option>
          <option value="full">Pełny backup (pliki + baza)</option>
        </Select>

        {showDbSelect && (
          <Select
            label="Baza danych"
            value={form.databaseId}
            onChange={(e) => set('databaseId', e.target.value)}
          >
            <option value="">Wybierz bazę danych...</option>
            {(databases ?? []).map((db) => (
              <option key={db.id} value={db.id}>
                {db.name} ({db.engine})
              </option>
            ))}
          </Select>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            Anuluj
          </Button>
          <Button type="submit" className="flex-1" loading={loading}>
            {!loading && 'Utwórz backup'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface RestoreModalProps {
  file: BackupFile | null
  onClose: () => void
}

function RestoreModal({ file, onClose }: RestoreModalProps) {
  const { data: sites } = useApi<Site[]>('/api/sites')
  const { data: databases } = useApi<Database[]>('/api/databases')
  const [siteId, setSiteId] = useState('')
  const [databaseId, setDatabaseId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const isDb = file?.filename.includes('_db_') ?? false

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !siteId) return
    setError('')
    setLoading(true)
    try {
      await api.post('/api/backups/restore', {
        filename: file.filename,
        siteId,
        databaseId: databaseId || undefined,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas przywracania')
    } finally {
      setLoading(false)
    }
  }

  if (!file) return null

  return (
    <Modal
      open={!!file}
      onClose={onClose}
      title="Przywróć backup"
      description={`Plik: ${file.filename}`}
      size="sm"
    >
      {done ? (
        <div className="space-y-4">
          <div className="px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            Przywracanie rozpoczęte w tle. Może potrwać kilka minut.
          </div>
          <Button className="w-full" onClick={onClose}>Zamknij</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
          <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
            Uwaga: przywrócenie nadpisze aktualne pliki / bazę danych.
          </div>
          <Select label="Strona docelowa" value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
            <option value="">Wybierz stronę...</option>
            {(sites ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.domain}</option>
            ))}
          </Select>
          {isDb && (
            <Select label="Baza danych docelowa" value={databaseId} onChange={(e) => setDatabaseId(e.target.value)}>
              <option value="">Wybierz bazę danych...</option>
              {(databases ?? []).filter((db) => !siteId || db.siteId === siteId).map((db) => (
                <option key={db.id} value={db.id}>{db.name} ({db.engine})</option>
              ))}
            </Select>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Anuluj</Button>
            <Button type="submit" className="flex-1" loading={loading}>
              {!loading && 'Przywróć'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export default function BackupsPage() {
  const user = useAuthStore((s) => s.user)
  const { data: sites } = useApi<Site[]>('/api/sites')

  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleFreq, setScheduleFreq] = useState('daily')
  const [retentionDays, setRetentionDays] = useState(30)

  const [s3Status, setS3Status] = useState<{ configured: boolean } | null>(null)

  useEffect(() => {
    api.get<{ configured: boolean }>('/api/backups/s3-status')
      .then(setS3Status).catch(() => {})
  }, [])

  const [siteFilter, setSiteFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [files, setFiles] = useState<BackupFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [restoreFile, setRestoreFile] = useState<BackupFile | null>(null)

  const fetchBackups = useCallback(async () => {
    setLoadingFiles(true)
    try {
      const url = siteFilter ? `/api/backups?siteId=${siteFilter}` : '/api/backups'
      const result = await api.get<{ files: BackupFile[] }>(url)
      setFiles(result.files)
    } catch {
      setFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }, [siteFilter])

  useEffect(() => {
    fetchBackups()
  }, [fetchBackups])

  // Auto-refresh every 5s when any backup job is running (detected by recent timestamps)
  // We poll the backup records from API to detect running status
  const [backupRecords, setBackupRecords] = useState<BackupRecord[]>([])

  const fetchRecords = useCallback(async () => {
    try {
      const url = siteFilter ? `/api/backups?siteId=${siteFilter}` : '/api/backups'
      // Records are served from the same endpoint alongside files in a real setup;
      // here we re-use the files result. Polling for running backups via refetch.
    } catch {}
  }, [siteFilter])

  const hasRunning = files.some((f) => {
    // A file with createdAt within last 30s and very small size may be in progress —
    // but we track this via a separate state set after POST /api/backups
    return false
  })

  const [pendingRefresh, setPendingRefresh] = useState(false)

  useEffect(() => {
    if (!pendingRefresh) return
    const interval = setInterval(() => {
      fetchBackups()
    }, 5000)
    // Stop after 2 minutes
    const timeout = setTimeout(() => {
      setPendingRefresh(false)
      clearInterval(interval)
    }, 120_000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [pendingRefresh, fetchBackups])

  const handleCreateSuccess = () => {
    fetchBackups()
    setPendingRefresh(true)
  }

  const handleDelete = async (filename: string) => {
    if (!confirm(`Usunąć plik ${filename}?`)) return
    setDeleting(filename)
    try {
      await api.delete(`/api/backups/${encodeURIComponent(filename)}`)
      fetchBackups()
    } catch {
      alert('Błąd podczas usuwania pliku')
    } finally {
      setDeleting(null)
    }
  }

  const handleDownload = (filename: string) => {
    window.location.href = `${API_URL}/api/backups/download/${encodeURIComponent(filename)}`
  }

  // Stats
  const totalSize = files.reduce((sum, f) => sum + f.sizeMb, 0)
  const lastBackup = files.length > 0 ? files[0] : null

  return (
    <div className="min-h-screen">
      <Topbar title="Backup" subtitle="Kopie zapasowe stron i baz danych" />

      <div className="p-6 space-y-5">
        {/* S3 status badge */}
        {s3Status && (
          <div className="flex items-center gap-2">
            <Badge variant={s3Status.configured ? 'success' : 'neutral'}>
              {s3Status.configured ? 'S3 aktywny' : 'S3 niekonfigurowany'}
            </Badge>
          </div>
        )}

        {/* Backup schedule */}
        <Card>
          <CardHeader>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-blue-400" />
            </div>
            <CardTitle>Harmonogram backupów</CardTitle>
            <div className="ml-auto">
              <button
                onClick={() => setScheduleEnabled(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${scheduleEnabled ? 'bg-[var(--primary)]' : 'bg-white/20'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${scheduleEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </CardHeader>
          {scheduleEnabled && (
            <CardContent>
              <div className="flex items-center gap-3">
                <p className="text-sm text-[var(--text-secondary)]">Częstotliwość:</p>
                {['daily', 'weekly', 'monthly'].map(freq => (
                  <button
                    key={freq}
                    onClick={() => setScheduleFreq(freq)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      scheduleFreq === freq
                        ? 'bg-[var(--primary)] text-white'
                        : 'glass text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {freq === 'daily' ? 'Codziennie' : freq === 'weekly' ? 'Co tydzień' : 'Co miesiąc'}
                  </button>
                ))}
                <p className="text-xs text-[var(--text-muted)] ml-auto">Funkcja wkrótce dostępna w pełni</p>
              </div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
                <p className="text-sm text-[var(--text-secondary)]">Retencja:</p>
                {[7, 14, 30, 90].map(days => (
                  <button
                    key={days}
                    onClick={() => setRetentionDays(days)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      retentionDays === days
                        ? 'bg-[var(--primary)] text-white'
                        : 'glass text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {days} dni
                  </button>
                ))}
                <button
                  onClick={async () => {
                    try {
                      const result = await api.delete<{ deleted: number }>(`/api/backups/cleanup?days=${retentionDays}`)
                      alert(`Usunięto ${result.deleted} starych backupów`)
                      fetchBackups()
                    } catch {}
                  }}
                  className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Wyczyść teraz
                </button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Liczba backupów"
            value={String(files.length)}
            icon={Archive}
            color="pink"
          />
          <StatCard
            title="Łączny rozmiar"
            value={formatSize(totalSize)}
            icon={HardDrive}
            color="purple"
          />
          <StatCard
            title="Ostatni backup"
            value={lastBackup ? formatBackupDate(lastBackup.createdAt) : '—'}
            icon={Clock}
            color="blue"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-52">
            <Select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
            >
              <option value="">Wszystkie strony</option>
              {(sites ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.domain}
                </option>
              ))}
            </Select>
          </div>

          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={fetchBackups}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Utwórz backup
            </Button>
          </div>
        </div>

        {/* Backups table */}
        <Card className="p-0 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.06] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            <span className="w-8" />
            <span className="flex-1">Plik</span>
            <span className="hidden md:block w-40">Domena</span>
            <span className="hidden sm:block w-28">Typ</span>
            <span className="hidden lg:block w-24">Rozmiar</span>
            <span className="hidden xl:block w-36">Data</span>
            <span className="w-20" />
          </div>

          {loadingFiles && (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loadingFiles && files.length === 0 && (
            <EmptyState
              icon={HardDrive}
              title="Brak kopii zapasowych"
              description="Utwórz pierwszy backup plików lub bazy danych"
              action={{ label: 'Utwórz backup', onClick: () => setShowCreate(true) }}
            />
          )}

          {!loadingFiles &&
            files.map((file) => (
              <div
                key={file.filename}
                className="flex items-center gap-4 px-4 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] group transition-colors"
              >
                {/* Icon */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    file.type === 'files'
                      ? 'bg-blue-500/10'
                      : file.type === 'database'
                      ? 'bg-green-500/10'
                      : 'bg-[var(--primary)]/10'
                  }`}
                >
                  <TypeIcon type={file.type} />
                </div>

                {/* Filename */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate font-mono">
                    {file.filename}
                  </p>
                </div>

                {/* Domain */}
                <div className="hidden md:block w-40 text-sm text-[var(--text-muted)] truncate">
                  {file.domain ?? '—'}
                </div>

                {/* Type badge */}
                <div className="hidden sm:block w-28">
                  <TypeBadge type={file.type} />
                </div>

                {/* Size */}
                <div className="hidden lg:block w-24 text-sm text-[var(--text-secondary)]">
                  {formatSize(file.sizeMb)}
                </div>

                {/* Date */}
                <div className="hidden xl:block w-36 text-sm text-[var(--text-muted)]">
                  {formatBackupDate(file.createdAt)}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity w-28 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRestoreFile(file)}
                    title="Przywróć"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDownload(file.filename)}
                    title="Pobierz"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(file.filename)}
                    loading={deleting === file.filename}
                    title="Usuń"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
        </Card>
      </div>

      <CreateBackupModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={handleCreateSuccess}
      />

      <RestoreModal
        file={restoreFile}
        onClose={() => setRestoreFile(null)}
      />
    </div>
  )
}
