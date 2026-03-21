'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { useApi } from '@/hooks/use-api'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Users, Plus, Trash2, Power, Mail, Lock, User, Building2, RefreshCw, Link2, Globe, Database as DbIcon, CheckCircle2, Shield } from 'lucide-react'

interface UserRecord {
  id: string
  email: string
  name: string
  company: string | null
  role: string
  isActive: boolean
  createdAt: string
  _count: { sites: number; databases: number }
}

interface SiteItem {
  id: string
  domain: string
  status: string
  userId: string
  user?: { name: string }
}

interface DbItem {
  id: string
  name: string
  engine: string
  userId: string
  user?: { name: string }
}

// ── Resources Modal ────────────────────────────────────────────────────────────

function ResourcesModal({
  user,
  onClose,
}: {
  user: UserRecord
  onClose: () => void
}) {
  const { data: sites, loading: sitesLoading } = useApi<SiteItem[]>('/api/sites')
  const { data: dbs, loading: dbsLoading } = useApi<DbItem[]>('/api/databases')
  const [assigned, setAssigned] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState<string | null>(null)

  const handleAssignSite = async (siteId: string) => {
    setAssigning(siteId)
    try {
      await api.post(`/api/users/${user.id}/assign-site`, { siteId })
      setAssigned((prev) => new Set(prev).add(siteId))
    } catch {
      // ignore
    } finally {
      setAssigning(null)
    }
  }

  const handleAssignDb = async (databaseId: string) => {
    setAssigning(databaseId)
    try {
      await api.post(`/api/users/${user.id}/assign-db`, { databaseId })
      setAssigned((prev) => new Set(prev).add(databaseId))
    } catch {
      // ignore
    } finally {
      setAssigning(null)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Zasoby użytkownika"
      description={`Przypisz strony i bazy danych do: ${user.name}`}
      size="lg"
    >
      <div className="space-y-6">
        {/* Sites */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-[var(--primary)]" />
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Strony</h4>
          </div>
          {sitesLoading ? (
            <div className="py-4 flex justify-center">
              <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (sites ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-3 text-center">Brak stron</p>
          ) : (
            <div className="space-y-2">
              {(sites ?? []).map((site) => {
                const isOwner = site.userId === user.id
                const justAssigned = assigned.has(site.id)
                return (
                  <div
                    key={site.id}
                    className="flex items-center gap-3 p-3 rounded-xl glass border border-white/[0.06]"
                  >
                    <Globe className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{site.domain}</p>
                      {site.user && (
                        <p className="text-xs text-[var(--text-muted)]">Właściciel: {site.user.name}</p>
                      )}
                    </div>
                    {isOwner || justAssigned ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isOwner ? 'Przypisana' : 'Przypisano!'}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={assigning === site.id}
                        onClick={() => handleAssignSite(site.id)}
                      >
                        Przypisz
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Databases */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <DbIcon className="w-4 h-4 text-[var(--secondary)]" />
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Bazy danych</h4>
          </div>
          {dbsLoading ? (
            <div className="py-4 flex justify-center">
              <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (dbs ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-3 text-center">Brak baz danych</p>
          ) : (
            <div className="space-y-2">
              {(dbs ?? []).map((db) => {
                const isOwner = db.userId === user.id
                const justAssigned = assigned.has(db.id)
                return (
                  <div
                    key={db.id}
                    className="flex items-center gap-3 p-3 rounded-xl glass border border-white/[0.06]"
                  >
                    <DbIcon className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{db.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{db.engine}</p>
                    </div>
                    {isOwner || justAssigned ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isOwner ? 'Przypisana' : 'Przypisano!'}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={assigning === db.id}
                        onClick={() => handleAssignDb(db.id)}
                      >
                        Przypisz
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="pt-2">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Zamknij
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Permissions Modal ──────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  sites: 'Strony WWW',
  databases: 'Bazy danych',
  ssl: 'Certyfikaty SSL',
  wordpress: 'WordPress',
  dns: 'DNS / Cloudflare',
  docker: 'Docker',
  files: 'Menedżer plików',
  ftp: 'FTP / SFTP',
  cron: 'Cron Jobs',
  backups: 'Backup',
  logs: 'Logi',
}
const ALL_SECTIONS = Object.keys(SECTION_LABELS)

interface DockerItem { id: string; name: string; image: string; status: string }

function PermissionsModal({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const [sections, setSections] = useState<string[]>([])
  const [dockerIds, setDockerIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const { data: containers } = useApi<DockerItem[]>('/api/docker')

  useEffect(() => {
    api.get<{ sections: string[]; dockerContainerIds: string[] } | null>(`/api/users/${user.id}/permissions`)
      .then((perms) => {
        if (perms) {
          setSections(perms.sections)
          setDockerIds(perms.dockerContainerIds)
        } else {
          setSections([...ALL_SECTIONS])
          setDockerIds([])
        }
        setLoaded(true)
      })
      .catch(() => {
        setSections([...ALL_SECTIONS])
        setLoaded(true)
      })
  }, [user.id])

  const toggleSection = (s: string) => {
    setSections((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }

  const toggleDocker = (id: string) => {
    setDockerIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/api/users/${user.id}/permissions`, { sections, dockerContainerIds: dockerIds })
      onClose()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Błąd zapisywania uprawnień')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  return (
    <Modal open onClose={onClose} title="Uprawnienia" description={`Konfiguruj dostęp dla: ${user.name}`} size="lg">
      <div className="space-y-6">
        {/* Panel sections */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Sekcje panelu</p>
            <div className="flex gap-2">
              <button className="text-xs text-[var(--primary)] hover:underline" onClick={() => setSections([...ALL_SECTIONS])}>
                Wszystkie
              </button>
              <button className="text-xs text-[var(--text-muted)] hover:underline" onClick={() => setSections([])}>
                Żadna
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ALL_SECTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2.5 px-3 py-2 rounded-xl glass border border-white/[0.06] cursor-pointer hover:bg-white/[0.03]">
                <input
                  type="checkbox"
                  checked={sections.includes(s)}
                  onChange={() => toggleSection(s)}
                  className="accent-[var(--primary)] w-4 h-4"
                />
                <span className="text-sm text-[var(--text-secondary)]">{SECTION_LABELS[s]}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Docker containers */}
        {(containers ?? []).length > 0 && (
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">Dostęp do kontenerów Docker</p>
            <div className="space-y-2">
              {(containers ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl glass border border-white/[0.06] cursor-pointer hover:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    checked={dockerIds.includes(c.id)}
                    onChange={() => toggleDocker(c.id)}
                    className="accent-[var(--primary)] w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[var(--text-secondary)]">{c.name}</span>
                    <span className="text-xs text-[var(--text-muted)] ml-2">{c.image}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Anuluj</Button>
          <Button className="flex-1" onClick={handleSave} loading={saving}>Zapisz uprawnienia</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function UsersPage() {
  const { data, loading, refetch } = useApi<UserRecord[]>('/api/users')
  const [showCreate, setShowCreate] = useState(false)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '', role: 'client' })
  const [resourcesUser, setResourcesUser] = useState<UserRecord | null>(null)
  const [permissionsUser, setPermissionsUser] = useState<UserRecord | null>(null)

  const users = data ?? []
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    setCreating(true)
    try {
      await api.post('/api/users', form)
      refetch()
      setShowCreate(false)
      setForm({ name: '', email: '', password: '', company: '', role: 'client' })
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Błąd podczas tworzenia')
    } finally {
      setCreating(false)
    }
  }

  const handleToggle = async (user: UserRecord) => {
    await api.patch(`/api/users/${user.id}`, { isActive: !user.isActive })
    refetch()
  }

  const handleDelete = async (user: UserRecord) => {
    if (!confirm(`Usunąć użytkownika ${user.email}? Zostaną usunięte wszystkie jego strony, bazy danych i inne zasoby.`)) return
    try {
      await api.delete(`/api/users/${user.id}`)
      refetch()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Nie można usunąć użytkownika')
    }
  }

  return (
    <div className="min-h-screen">
      <Topbar title="Użytkownicy" subtitle={`${users.length} kont`} />

      <div className="p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Łącznie', value: users.length, color: 'text-[var(--primary)]' },
            { label: 'Klientów', value: users.filter((u) => u.role === 'client').length, color: 'text-blue-400' },
            { label: 'Adminów', value: users.filter((u) => u.role === 'admin').length, color: 'text-purple-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="glass rounded-xl p-4 border border-white/[0.06]">
              <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex justify-between items-center">
          <Button variant="secondary" size="sm" onClick={refetch}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Nowy użytkownik
          </Button>
        </div>

        {/* Table */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.06] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            <span className="flex-1">Użytkownik</span>
            <span className="hidden md:block w-24">Rola</span>
            <span className="hidden lg:block w-28">Strony / Bazy</span>
            <span className="hidden xl:block w-36">Dołączył</span>
            <span className="w-24">Status</span>
            <span className="w-16" />
          </div>

          {loading && (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && users.length === 0 && (
            <EmptyState
              icon={Users}
              title="Brak użytkowników"
              description="Dodaj pierwszego klienta hostingowego"
              action={{ label: 'Dodaj użytkownika', onClick: () => setShowCreate(true) }}
            />
          )}

          {!loading && users.map((user) => (
            <div key={user.id} className="flex items-center gap-4 px-4 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] group transition-colors">
              {/* Avatar + info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{user.name}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{user.email}</p>
                  {user.company && (
                    <p className="text-xs text-[var(--text-muted)] truncate">{user.company}</p>
                  )}
                </div>
              </div>

              {/* Role */}
              <div className="hidden md:block w-24">
                <Badge variant={user.role === 'admin' ? 'brand' : 'neutral'}>
                  {user.role === 'admin' ? 'Admin' : 'Klient'}
                </Badge>
              </div>

              {/* Counts */}
              <div className="hidden lg:flex w-28 gap-3">
                <span className="text-sm text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">{user._count.sites}</span> stron
                </span>
                <span className="text-sm text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">{user._count.databases}</span> baz
                </span>
              </div>

              {/* Date */}
              <div className="hidden xl:block w-36 text-xs text-[var(--text-muted)]">
                {formatDate(user.createdAt)}
              </div>

              {/* Status */}
              <div className="w-24">
                <Badge variant={user.isActive ? 'success' : 'error'}>
                  {user.isActive ? 'Aktywny' : 'Zablokowany'}
                </Badge>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {user.role === 'client' && (
                  <Button variant="secondary" size="sm" onClick={() => setPermissionsUser(user)} title="Uprawnienia">
                    <Shield className="w-4 h-4" />
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setResourcesUser(user)} title="Zarządzaj zasobami">
                  <Link2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggle(user)} title={user.isActive ? 'Zablokuj' : 'Odblokuj'}>
                  <Power className="w-4 h-4" />
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(user)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Resources modal */}
      {resourcesUser && (
        <ResourcesModal user={resourcesUser} onClose={() => setResourcesUser(null)} />
      )}

      {/* Permissions modal */}
      {permissionsUser && (
        <PermissionsModal user={permissionsUser} onClose={() => { setPermissionsUser(null); refetch() }} />
      )}

      {/* Create user modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nowy użytkownik" description="Utwórz konto klienta hostingowego">
        {createError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {createError}
          </div>
        )}
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Imię i nazwisko" placeholder="Jan Kowalski" value={form.name} onChange={(e) => set('name', e.target.value)} icon={<User className="w-4 h-4" />} required />
            <Input label="Firma (opcjonalnie)" placeholder="ACME Sp. z o.o." value={form.company} onChange={(e) => set('company', e.target.value)} icon={<Building2 className="w-4 h-4" />} />
          </div>
          <Input label="Email" type="email" placeholder="klient@firma.pl" value={form.email} onChange={(e) => set('email', e.target.value)} icon={<Mail className="w-4 h-4" />} required />
          <Input label="Hasło" type="password" placeholder="min. 8 znaków" value={form.password} onChange={(e) => set('password', e.target.value)} icon={<Lock className="w-4 h-4" />} required />
          <Select label="Rola" value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="client">Klient</option>
            <option value="admin">Administrator</option>
          </Select>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowCreate(false)}>Anuluj</Button>
            <Button type="submit" className="flex-1" loading={creating}>{!creating && 'Utwórz konto'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
