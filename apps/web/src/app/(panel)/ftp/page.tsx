'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useApi } from '@/hooks/use-api'
import { api, ApiError } from '@/lib/api'
import {
  User,
  Plus,
  RefreshCw,
  Trash2,
  KeyRound,
  AlertTriangle,
  FolderOpen,
  Globe,
  AlertCircle,
  Server,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FtpUser {
  id: string
  username: string
  homeDir: string
  isActive: boolean
  createdAt: string
  site?: { domain: string } | null
}

interface Site {
  id: string
  domain: string
  documentRoot: string
}

// ─── Add FTP User Modal ────────────────────────────────────────────────────────

interface AddFtpModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function AddFtpModal({ open, onClose, onSuccess }: AddFtpModalProps) {
  const { data: sites } = useApi<Site[]>('/api/sites')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ username: '', password: '', siteId: '' })

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const selectedSite = sites?.find((s) => s.id === form.siteId)
  const previewDir = selectedSite
    ? selectedSite.documentRoot
    : form.username
    ? `/var/www/${form.username}`
    : '/var/www/…'

  const handleClose = () => {
    setForm({ username: '', password: '', siteId: '' })
    setError('')
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/ftp', {
        username: form.username,
        password: form.password,
        ...(form.siteId ? { siteId: form.siteId } : {}),
      })
      onSuccess()
      handleClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas tworzenia konta FTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nowe konto FTP"
      description="Utwórz wirtualnego użytkownika pure-ftpd"
      size="md"
    >
      {error && (
        <div className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Username */}
        <Input
          label="Nazwa użytkownika FTP"
          placeholder="np. klient_ftp"
          value={form.username}
          onChange={(e) => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          icon={<User className="w-4 h-4" />}
          required
        />

        {/* Password */}
        <Input
          label="Hasło"
          type="password"
          placeholder="Min. 8 znaków"
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          icon={<KeyRound className="w-4 h-4" />}
          required
        />

        {/* Site */}
        <Select
          label="Przypisz do strony (opcjonalnie)"
          value={form.siteId}
          onChange={(e) => set('siteId', e.target.value)}
        >
          <option value="">— brak przypisania —</option>
          {(sites ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.domain}
            </option>
          ))}
        </Select>

        {/* Home dir preview */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
          <FolderOpen className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider leading-none mb-0.5">
              Katalog domowy
            </p>
            <code className="text-xs font-mono text-[var(--primary)] truncate block">
              {previewDir}
            </code>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            Anuluj
          </Button>
          <Button type="submit" className="flex-1" loading={loading}>
            {!loading && <><Plus className="w-4 h-4" /> Utwórz konto</>}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Reset Password Modal ──────────────────────────────────────────────────────

interface ResetPasswordModalProps {
  user: FtpUser | null
  onClose: () => void
  onSuccess: () => void
}

function ResetPasswordModal({ user, onClose, onSuccess }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    setPassword('')
    setError('')
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError('')
    setLoading(true)
    try {
      await api.post(`/api/ftp/${user.id}/reset-password`, { password })
      onSuccess()
      handleClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas zmiany hasła')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={user !== null}
      onClose={handleClose}
      title="Reset hasła FTP"
      description={user ? `Zmień hasło dla użytkownika ${user.username}` : ''}
      size="sm"
    >
      {error && (
        <div className="mb-4 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nowe hasło"
          type="password"
          placeholder="Min. 8 znaków"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<KeyRound className="w-4 h-4" />}
          required
        />

        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            Anuluj
          </Button>
          <Button type="submit" className="flex-1" loading={loading}>
            {!loading && <><KeyRound className="w-4 h-4" /> Zmień hasło</>}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FtpPage() {
  const { data, loading, error, refetch } = useApi<FtpUser[]>('/api/ftp')
  const [ftpAvailable, setFtpAvailable] = useState<boolean | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [resetTarget, setResetTarget] = useState<FtpUser | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const users = data ?? []

  // Check pure-ftpd availability on mount
  useEffect(() => {
    api.get<{ available: boolean }>('/api/ftp/status')
      .then((res) => setFtpAvailable(res.available))
      .catch(() => setFtpAvailable(false))
  }, [])

  const handleDelete = async (user: FtpUser) => {
    if (!confirm(`Usunąć użytkownika FTP "${user.username}"? Tej operacji nie można cofnąć.`)) return
    setDeleting(user.id)
    try {
      await api.delete(`/api/ftp/${user.id}`)
      refetch()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Błąd podczas usuwania użytkownika')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="min-h-screen">
      <Topbar
        title="FTP / SFTP"
        subtitle={`Zarządzanie kontami FTP · ${users.length} kont`}
      />

      <div className="p-6 space-y-5">

        {/* ── pure-ftpd not installed warning ── */}
        {ftpAvailable === false && (
          <div className="flex items-start gap-3 px-4 py-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold mb-0.5">
                pure-ftpd nie jest zainstalowany
              </p>
              <p className="text-xs text-amber-400/80">
                Aby korzystać z FTP, zainstaluj pakiet:&nbsp;
                <code className="font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  apt install pure-ftpd
                </code>
              </p>
            </div>
          </div>
        )}

        {/* ── Stats + toolbar ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Active count */}
            <div className="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2.5 border border-white/[0.08]">
              <div className="w-7 h-7 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-[var(--primary)]" />
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--text-primary)] leading-none">{users.length}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Kont FTP</p>
              </div>
            </div>

            {/* Active indicator */}
            <div className="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2.5 border border-white/[0.08]">
              <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Server className="w-3.5 h-3.5 text-green-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--text-primary)] leading-none">
                  {users.filter((u) => u.isActive).length}
                </p>
                <p className="text-[10px] text-[var(--text-muted)]">Aktywnych</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refetch} title="Odśwież">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              disabled={ftpAvailable === false}
              title={ftpAvailable === false ? 'pure-ftpd nie jest zainstalowany' : undefined}
            >
              <Plus className="w-4 h-4" />
              Nowe konto FTP
            </Button>
          </div>
        </div>

        {/* ── Users table ── */}
        <Card className="p-0 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.06] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            <span className="w-8" />
            <span className="flex-1">Użytkownik</span>
            <span className="hidden lg:block w-36">Strona</span>
            <span className="hidden md:block flex-1">Katalog domowy</span>
            <span className="w-20 text-center">Status</span>
            <span className="w-24 text-right">Akcje</span>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="py-14 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="py-10 flex flex-col items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-6 h-6" />
              <p>Błąd podczas ładowania: {error}</p>
              <Button variant="secondary" size="sm" onClick={refetch}>
                Spróbuj ponownie
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && users.length === 0 && (
            <EmptyState
              icon={User}
              title="Brak kont FTP"
              description="Utwórz pierwsze konto FTP aby umożliwić transfer plików"
              action={
                ftpAvailable !== false
                  ? { label: 'Nowe konto FTP', onClick: () => setShowAdd(true) }
                  : undefined
              }
            />
          )}

          {/* User rows */}
          {!loading && !error && users.map((user) => {
            const isDeletingThis = deleting === user.id

            return (
              <div
                key={user.id}
                className="flex items-center gap-4 px-4 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] transition-colors group"
              >
                {/* Icon */}
                <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-[var(--primary)]" />
                </div>

                {/* Username */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {user.username}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] font-mono">
                    FTP · port 21
                  </p>
                </div>

                {/* Site */}
                <div className="hidden lg:flex items-center gap-1.5 w-36 flex-shrink-0">
                  {user.site ? (
                    <>
                      <Globe className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                      <span className="text-sm text-[var(--text-secondary)] truncate">
                        {user.site.domain}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-[var(--text-muted)]">—</span>
                  )}
                </div>

                {/* Home dir */}
                <div className="hidden md:flex items-center gap-1.5 flex-1 min-w-0">
                  <FolderOpen className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                  <code className="text-xs font-mono text-[var(--text-secondary)] truncate">
                    {user.homeDir}
                  </code>
                </div>

                {/* Status */}
                <div className="w-20 flex justify-center flex-shrink-0">
                  <Badge variant={user.isActive ? 'success' : 'neutral'}>
                    {user.isActive ? 'Aktywny' : 'Nieaktywny'}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 w-24 justify-end flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setResetTarget(user)}
                    title="Reset hasła"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(user)}
                    loading={isDeletingThis}
                    title="Usuń konto FTP"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </Card>

        {/* ── Info box ── */}
        {users.length > 0 && (
          <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[var(--text-muted)]">
            <Server className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              Połącz się przez klienta FTP (np. FileZilla) używając adresu serwera, portu&nbsp;
              <code className="font-mono bg-white/5 px-1 rounded">21</code>,
              nazwy użytkownika i hasła ustawionego przy tworzeniu konta.
              Obsługiwane protokoły: FTP, FTPS (explicit TLS).
            </p>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AddFtpModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={refetch}
      />

      <ResetPasswordModal
        user={resetTarget}
        onClose={() => setResetTarget(null)}
        onSuccess={refetch}
      />
    </div>
  )
}
