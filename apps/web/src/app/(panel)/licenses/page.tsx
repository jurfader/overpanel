'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { useApi } from '@/hooks/use-api'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  Key, Plus, Trash2, RefreshCw, Mail, Copy, Eye,
  Shield, AlertCircle, CheckCircle2, XCircle, Users,
} from 'lucide-react'

interface License {
  id: string
  key: string
  plan: string
  status: string
  buyerEmail: string
  buyerName: string | null
  maxInstallations: number
  expiresAt: string | null
  createdAt: string
  activeCount?: number
}

interface LicenseStats {
  totalLicenses: number
  activeLicenses: number
  totalActivations: number
}

function planLabel(plan: string) {
  switch (plan) {
    case 'agency': return 'Agency'
    case 'solo': return 'Solo'
    case 'trial': return 'Trial'
    default: return plan
  }
}

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'active': return 'success'
    case 'suspended': return 'warning'
    case 'expired': case 'revoked': return 'error'
    default: return 'neutral'
  }
}

function CreateLicenseModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [plan, setPlan] = useState('solo')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [sendEmail, setSendEmail] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdKey, setCreatedKey] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await api.post<{ data: License }>('/api/licenses', {
        plan,
        buyerEmail,
        buyerName: buyerName || undefined,
        sendEmail,
        notes: notes || undefined,
      })
      setCreatedKey((result as any).key || (result as any).data?.key || '')
      onSuccess()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd tworzenia licencji')
    } finally {
      setSaving(false)
    }
  }

  if (createdKey) {
    return (
      <Modal open onClose={onClose} title="Licencja utworzona">
        <div className="space-y-4 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">Klucz licencji:</p>
          <div className="flex items-center justify-center gap-2">
            <code className="text-lg font-mono font-bold text-[var(--primary)] bg-white/5 px-4 py-2 rounded-xl tracking-widest">
              {createdKey}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(createdKey)}
              className="p-2 rounded-lg hover:bg-white/10 text-[var(--text-muted)]"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {sendEmail ? 'Email z kluczem został wysłany.' : 'Skopiuj klucz i przekaż klientowi.'}
          </p>
          <Button className="w-full" onClick={onClose}>Zamknij</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Nowa licencja OverCMS">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="trial">Trial (14 dni, 1 instalacja)</option>
          <option value="solo">Solo (bezterminowa, 1 instalacja)</option>
          <option value="agency">Agency (bezterminowa, bez limitu)</option>
        </Select>

        <Input
          label="E-mail kupującego"
          type="email"
          placeholder="klient@example.com"
          value={buyerEmail}
          onChange={(e) => setBuyerEmail(e.target.value)}
          icon={<Mail className="w-4 h-4" />}
          required
        />

        <Input
          label="Imię i nazwisko"
          placeholder="Jan Kowalski"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
        />

        <Input
          label="Notatki"
          placeholder="Opcjonalnie..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--primary)]"
          />
          <label className="text-sm text-[var(--text-secondary)]">
            Wyślij klucz e-mailem do kupującego
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Anuluj</Button>
          <Button type="submit" className="flex-1" loading={saving}>
            <Key className="w-4 h-4" /> Utwórz
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function LicensesPage() {
  const { data: licensesData, loading, refetch } = useApi<License[]>('/api/licenses')
  const { data: statsData } = useApi<LicenseStats>('/api/licenses/stats')

  const [showCreate, setShowCreate] = useState(false)
  const [showKey, setShowKey] = useState<string | null>(null)

  const licenses = Array.isArray(licensesData) ? licensesData : []
  const stats = statsData

  const handleRevoke = async (key: string) => {
    if (!confirm(`Unieważnić licencję ${key}?`)) return
    try {
      await api.delete(`/api/licenses/${key}`)
      refetch()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Błąd')
    }
  }

  // If API returns 404, license management is not available
  if (!loading && !licensesData) {
    return (
      <div className="min-h-screen">
        <Topbar title="Licencje OverCMS" subtitle="Zarządzanie licencjami" />
        <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <Shield className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-sm text-[var(--text-secondary)] text-center">
            Zarządzanie licencjami nie jest dostępne na tej instalacji.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Topbar title="Licencje OverCMS" subtitle={`${licenses.length} licencji`} />

      <div className="p-6 space-y-6">

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                  <Key className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.totalLicenses}</p>
                  <p className="text-xs text-[var(--text-muted)]">Łącznie</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.activeLicenses}</p>
                  <p className="text-xs text-[var(--text-muted)]">Aktywnych</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.totalActivations}</p>
                  <p className="text-xs text-[var(--text-muted)]">Aktywacji</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* License list */}
        <Card>
          <CardHeader>
            <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
              <Key className="w-4 h-4 text-[var(--primary)]" />
            </div>
            <CardTitle>Licencje</CardTitle>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" /> Nowa licencja
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {licenses.length === 0 ? (
              <EmptyState icon={Key} title="Brak licencji" description="Utwórz pierwszą licencję OverCMS" />
            ) : (
              <div className="space-y-1">
                <div className="hidden lg:flex items-center gap-4 px-4 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                  <span className="w-44">Klucz</span>
                  <span className="flex-1">Kupujący</span>
                  <span className="w-20">Plan</span>
                  <span className="w-16">Aktywacji</span>
                  <span className="w-24">Status</span>
                  <span className="w-28">Utworzono</span>
                  <span className="w-20">Akcje</span>
                </div>
                {licenses.map((lic: License) => (
                  <div key={lic.id} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                    <div className="w-44">
                      <div className="flex items-center gap-1">
                        <code className="text-xs font-mono text-[var(--primary)]">{lic.key}</code>
                        <button
                          onClick={() => navigator.clipboard.writeText(lic.key)}
                          className="p-0.5 rounded hover:bg-white/10 text-[var(--text-muted)]"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text-primary)] truncate">{lic.buyerEmail}</p>
                      {lic.buyerName && <p className="text-xs text-[var(--text-muted)] truncate">{lic.buyerName}</p>}
                    </div>
                    <span className="hidden lg:block w-20">
                      <Badge variant="brand">{planLabel(lic.plan)}</Badge>
                    </span>
                    <span className="hidden lg:block w-16 text-xs text-[var(--text-muted)] text-center">
                      {lic.activeCount ?? 0} / {lic.maxInstallations}
                    </span>
                    <span className="w-24">
                      <Badge variant={statusVariant(lic.status)}>{lic.status}</Badge>
                    </span>
                    <span className="hidden lg:block w-28 text-xs text-[var(--text-muted)]">
                      {formatDate(lic.createdAt)}
                    </span>
                    <div className="w-20 flex gap-1">
                      {lic.status === 'active' && (
                        <Button variant="danger" size="sm" onClick={() => handleRevoke(lic.key)} title="Unieważnij">
                          <XCircle className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showCreate && (
        <CreateLicenseModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { refetch(); }}
        />
      )}
    </div>
  )
}
