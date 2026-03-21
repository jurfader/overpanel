'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { CreateDbModal } from '@/components/databases/create-db-modal'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import type { Database } from '@overpanel/shared'
import { formatBytes, formatDate } from '@/lib/utils'
import { Database as DbIcon, Plus, RefreshCw, Trash2, Download, Server, Upload, ExternalLink, Container } from 'lucide-react'
import { Modal } from '@/components/ui/modal'

type DbWithSite = Database & { site?: { domain: string } }

// ── Import SQL Modal ───────────────────────────────────────────────────────────

interface ImportModalProps {
  db: DbWithSite
  onClose: () => void
  onSuccess: () => void
}

function ImportModal({ db, onClose, onSuccess }: ImportModalProps) {
  const [importSql, setImportSql] = useState('')
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = btoa(ev.target!.result as string)
      setImportSql(base64)
    }
    reader.readAsBinaryString(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importSql) { setError('Wybierz plik SQL'); return }
    setLoading(true)
    setError('')
    try {
      await api.post(`/api/databases/${db.id}/import`, { sql: importSql })
      setSuccess(true)
      setTimeout(() => { onSuccess(); onClose() }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd podczas importu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Import SQL"
      description={`Importuj dane do bazy: ${db.name}`}
      size="sm"
    >
      {success ? (
        <div className="py-6 flex flex-col items-center gap-3 text-green-400">
          <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center">
            <Upload className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium">Import zakończony pomyślnie!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
          <div className="px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
            ⚠ Import nadpisze istniejące dane w bazie
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
              Plik SQL
            </label>
            <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-white/20 hover:border-[var(--primary)]/40 cursor-pointer transition-colors bg-white/[0.02] hover:bg-white/[0.04]">
              <Upload className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-sm text-[var(--text-muted)] truncate">
                {fileName || 'Wybierz plik .sql...'}
              </span>
              <input type="file" accept=".sql" className="hidden" onChange={handleFile} />
            </label>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-xl text-sm font-medium glass text-[var(--text-secondary)] border border-white/10 hover:text-[var(--text-primary)] transition-all"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={loading || !importSql}
              className="flex-1 h-9 rounded-xl text-sm font-medium gradient-brand text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Importowanie…' : 'Importuj SQL'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export default function DatabasesPage() {
  const user = useAuthStore((s) => s.user)
  const { data, loading, error, refetch } = useApi<DbWithSite[]>('/api/databases')
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<'all' | 'mysql' | 'postgresql'>('all')
  const [dumping, setDumping] = useState<string | null>(null)
  const [importDb, setImportDb] = useState<DbWithSite | null>(null)

  const dbs = data ?? []
  const filtered = dbs.filter((d) => filter === 'all' || d.engine === filter)

  const stats = {
    total: dbs.length,
    mysql: dbs.filter((d) => d.engine === 'mysql').length,
    pg: dbs.filter((d) => d.engine === 'postgresql').length,
  }

  const handleDelete = async (db: DbWithSite) => {
    if (!confirm(`Usunąć bazę ${db.name}? Tej operacji nie można cofnąć.`)) return
    await api.delete(`/api/databases/${db.id}`)
    refetch()
  }

  const handleAdminer = async (db: DbWithSite) => {
    try {
      const result = await api.get<{ url: string }>(`/api/databases/${db.id}/adminer-url`)
      window.open(result.url, '_blank')
    } catch {
      alert('Nie udało się otworzyć Adminer. Hasło niedostępne dla tej bazy.')
    }
  }

  const handleDump = async (db: DbWithSite) => {
    setDumping(db.id)
    try {
      await api.post(`/api/databases/${db.id}/dump`)
      alert('Backup SQL gotowy — sprawdź /var/overpanel/backups/')
    } catch {
      alert('Błąd podczas eksportu')
    } finally {
      setDumping(null)
    }
  }

  return (
    <div className="min-h-screen">
      <Topbar title="Bazy danych" subtitle={`MySQL: ${stats.mysql} · PostgreSQL: ${stats.pg}`} />

      <div className="p-6 space-y-5">
        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          {(['all', 'mysql', 'postgresql'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                filter === f
                  ? 'gradient-brand text-white shadow-[0_0_15px_rgba(233,30,140,0.3)]'
                  : 'glass text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {f === 'all' ? 'Wszystkie' : f === 'mysql' ? 'MySQL' : 'PostgreSQL'}
              <span className="ml-1.5 text-xs opacity-70">
                {f === 'all' ? stats.total : f === 'mysql' ? stats.mysql : stats.pg}
              </span>
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Nowa baza
            </Button>
          </div>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.06] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            <span className="w-8" />
            <span className="flex-1">Nazwa</span>
            <span className="hidden md:block w-32">Silnik</span>
            <span className="hidden lg:block w-32">Przypisana do</span>
            <span className="hidden xl:block w-24">Rozmiar</span>
            <span className="w-20" />
          </div>

          {loading && (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <EmptyState
              icon={DbIcon}
              title="Brak baz danych"
              description="Utwórz pierwszą bazę MySQL lub PostgreSQL"
              action={{ label: 'Utwórz bazę', onClick: () => setShowCreate(true) }}
            />
          )}

          {!loading && !error && filtered.map((db) => (
            <div key={db.id} className="flex items-center gap-4 px-4 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] group transition-colors">
              {/* Icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                db.engine === 'mysql' ? 'bg-orange-500/10' : 'bg-blue-500/10'
              }`}>
                <DbIcon className={`w-4 h-4 ${db.engine === 'mysql' ? 'text-orange-400' : 'text-blue-400'}`} />
              </div>

              {/* Name + user */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{db.name}</p>
                <p className="text-xs text-[var(--text-muted)] font-mono">
                  {db.dbUser}@localhost:{db.port}
                </p>
              </div>

              {/* Engine */}
              <div className="hidden md:flex w-32 items-center gap-1.5">
                <Badge variant={db.engine === 'mysql' ? 'warning' : 'info'}>
                  {db.engine === 'mysql' ? 'MySQL 8.0' : 'PostgreSQL 16'}
                </Badge>
                {db.isDocker && (
                  <Badge variant="brand">
                    <Container className="w-3 h-3" /> Docker
                  </Badge>
                )}
              </div>

              {/* Site */}
              <div className="hidden lg:block w-32 text-sm text-[var(--text-muted)] truncate">
                {db.site ? db.site.domain : '—'}
              </div>

              {/* Size */}
              <div className="hidden xl:block w-24 text-sm text-[var(--text-secondary)]">
                {db.sizeMb > 0 ? formatBytes(db.sizeMb * 1024 * 1024) : '< 1 MB'}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="secondary" size="sm" onClick={() => handleAdminer(db)} title="Otwórz w Adminer">
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleDump(db)} loading={dumping === db.id} title="Eksport SQL">
                  <Download className="w-4 h-4" />
                </Button>
                {db.engine === 'mysql' && !db.isDocker && (
                  <Button variant="secondary" size="sm" onClick={() => setImportDb(db)} title="Import SQL">
                    <Upload className="w-4 h-4" />
                  </Button>
                )}
                <Button variant="danger" size="sm" onClick={() => handleDelete(db)} title="Usuń bazę">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <CreateDbModal open={showCreate} onClose={() => setShowCreate(false)} onSuccess={refetch} />

      {importDb && (
        <ImportModal
          db={importDb}
          onClose={() => setImportDb(null)}
          onSuccess={refetch}
        />
      )}
    </div>
  )
}
