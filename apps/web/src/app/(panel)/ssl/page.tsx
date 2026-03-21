'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { useApi } from '@/hooks/use-api'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Shield, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'

function CustomCertModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [domain, setDomain] = useState('')
  const [certificate, setCertificate] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/api/ssl/custom', { domain, certificate, privateKey })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Błąd')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative z-10 rounded-2xl p-6 w-full max-w-lg border border-white/10 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Wgraj własny certyfikat SSL</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Domena</label>
            <input
              className="input w-full"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="example.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Certyfikat (PEM)</label>
            <textarea
              className="input w-full h-28 font-mono text-xs resize-none"
              value={certificate}
              onChange={e => setCertificate(e.target.value)}
              placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Klucz prywatny (PEM)</label>
            <textarea
              className="input w-full h-28 font-mono text-xs resize-none"
              value={privateKey}
              onChange={e => setPrivateKey(e.target.value)}
              placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
              required
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>Anuluj</Button>
            <Button type="submit" loading={loading}>Zainstaluj certyfikat</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface SslSite {
  id: string
  domain: string
  hasSSL: boolean
  sslExpiry: string | null
  status: string
}

export default function SslPage() {
  const { data, loading, refetch } = useApi<SslSite[]>('/api/sites')
  const [renewing, setRenewing] = useState<string | null>(null)
  const [customModal, setCustomModal] = useState(false)
  const [autorenewal, setAutorenewal] = useState<{ configured: boolean; cronLine: string | null } | null>(null)
  const [renewalLoading, setRenewalLoading] = useState(false)

  useEffect(() => {
    api.get<{ configured: boolean; cronLine: string | null }>('/api/ssl/autorenewal-status')
      .then(setAutorenewal).catch(() => {})
  }, [])

  const enableAutorenewal = async () => {
    setRenewalLoading(true)
    try {
      await api.post('/api/ssl/setup-autorenewal', {})
      setAutorenewal({ configured: true, cronLine: '0 0,12 * * * certbot renew...' })
    } catch {} finally { setRenewalLoading(false) }
  }

  const sites = (data ?? []).filter((s) => s.status === 'active')
  const withSsl = sites.filter((s) => s.hasSSL)
  const withoutSsl = sites.filter((s) => !s.hasSSL)

  const daysLeft = (expiry: string) => {
    const diff = new Date(expiry).getTime() - Date.now()
    return Math.ceil(diff / 86_400_000)
  }

  const handleRenew = async (siteId: string) => {
    setRenewing(siteId)
    try {
      await fetch(`/api/ssl/${siteId}/renew`, { method: 'POST', credentials: 'include' })
      refetch()
    } catch {
      alert('Błąd podczas odnawiania certyfikatu')
    } finally {
      setRenewing(null)
    }
  }

  return (
    <div className="min-h-screen">
      <Topbar title="Certyfikaty SSL" subtitle={`${withSsl.length} aktywnych · ${withoutSsl.length} bez SSL`} />

      <div className="p-6 space-y-5">
        {/* Top actions */}
        <div className="flex justify-end">
          <Button onClick={() => setCustomModal(true)}>Wgraj własny certyfikat</Button>
        </div>

        {/* Auto-renewal status */}
        {autorenewal !== null && (
          <div className="flex items-center gap-3 p-4 glass rounded-xl border border-white/10">
            <Shield className="w-4 h-4 text-[var(--primary)]" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">Auto-odnowienie certyfikatów</p>
              {autorenewal.cronLine && (
                <p className="text-xs text-[var(--text-muted)] font-mono">{autorenewal.cronLine}</p>
              )}
            </div>
            {autorenewal.configured ? (
              <Badge variant="success">Aktywny</Badge>
            ) : (
              <Button size="sm" onClick={enableAutorenewal} loading={renewalLoading}>
                Włącz auto-odnowienie
              </Button>
            )}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="glass rounded-xl p-4 border border-white/[0.06]">
            <p className="text-xs text-[var(--text-muted)] mb-1">Aktywnych SSL</p>
            <p className="text-2xl font-bold text-green-400">{withSsl.length}</p>
          </div>
          <div className="glass rounded-xl p-4 border border-white/[0.06]">
            <p className="text-xs text-[var(--text-muted)] mb-1">Wygasa &lt; 14 dni</p>
            <p className="text-2xl font-bold text-yellow-400">
              {withSsl.filter((s) => s.sslExpiry && daysLeft(s.sslExpiry) < 14).length}
            </p>
          </div>
          <div className="glass rounded-xl p-4 border border-white/[0.06]">
            <p className="text-xs text-[var(--text-muted)] mb-1">Bez SSL</p>
            <p className="text-2xl font-bold text-red-400">{withoutSsl.length}</p>
          </div>
        </div>

        {/* SSL certs list */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Certyfikaty Let's Encrypt</h3>
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {loading && (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && withSsl.length === 0 && (
            <EmptyState icon={Shield} title="Brak certyfikatów SSL" description="Certyfikaty są wystawiane automatycznie podczas tworzenia strony" />
          )}

          {!loading && withSsl.map((site) => {
            const days = site.sslExpiry ? daysLeft(site.sslExpiry) : null
            const isWarning = days !== null && days < 14
            const isExpired = days !== null && days <= 0

            return (
              <div key={site.id} className="flex items-center gap-4 px-4 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] group transition-colors">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isExpired ? 'bg-red-500/10' : isWarning ? 'bg-yellow-500/10' : 'bg-green-500/10'
                }`}>
                  {isExpired || isWarning
                    ? <AlertTriangle className={`w-4 h-4 ${isExpired ? 'text-red-400' : 'text-yellow-400'}`} />
                    : <CheckCircle2 className="w-4 h-4 text-green-400" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{site.domain}</p>
                  {site.sslExpiry && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Wygasa: {formatDate(site.sslExpiry)}
                      {days !== null && (
                        <span className={`ml-2 font-medium ${isExpired ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-green-400'}`}>
                          ({isExpired ? 'Wygasł!' : `${days} dni`})
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <Badge variant="neutral">Let's Encrypt</Badge>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRenew(site.id)}
                  loading={renewing === site.id}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <RefreshCw className="w-4 h-4" /> Odnów
                </Button>
              </div>
            )
          })}
        </Card>

        {/* Without SSL */}
        {withoutSsl.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Strony bez SSL</h3>
            </div>
            {withoutSsl.map((site) => (
              <div key={site.id} className="flex items-center gap-4 px-4 py-3.5 border-b border-white/[0.04] last:border-0">
                <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-red-400" />
                </div>
                <span className="flex-1 text-sm text-[var(--text-primary)]">{site.domain}</span>
                <Badge variant="error">Brak SSL</Badge>
                <Button size="sm" variant="outline" onClick={() => handleRenew(site.id)} loading={renewing === site.id}>
                  Włącz SSL
                </Button>
              </div>
            ))}
          </Card>
        )}
      </div>

      {customModal && (
        <CustomCertModal
          onClose={() => setCustomModal(false)}
          onSuccess={refetch}
        />
      )}
    </div>
  )
}
