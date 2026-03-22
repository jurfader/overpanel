'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/store/auth'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  Mail, Plus, Trash2, RefreshCw, Globe, Lock, User, Key,
  CheckCircle2, XCircle, Shield, Copy, ExternalLink, Server,
  AlertCircle, Eye, EyeOff, Download,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface MailDomainRecord {
  id: string
  domain: string
  isActive: boolean
  mxConfigured: boolean
  spfConfigured: boolean
  dkimConfigured: boolean
  dmarcConfigured: boolean
  createdAt: string
  _count: { mailboxes: number }
}

interface MailboxRecord {
  id: string
  address: string
  localPart: string
  displayName: string | null
  quotaMb: number
  isActive: boolean
  createdAt: string
  domain: { domain: string }
}

interface ConnectionInfo {
  imap: { host: string; port: number; security: string }
  smtp: { host: string; port: number; security: string }
  webmailUrl: string | null
}

// ── DNS Status Badge ─────────────────────────────────────────────────────────

function DnsBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium ${
      ok ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
    }`}>
      {ok ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
      {label}
    </span>
  )
}

// ── Create Mailbox Modal ─────────────────────────────────────────────────────

function CreateMailboxModal({
  domains,
  onClose,
  onSuccess,
}: {
  domains: MailDomainRecord[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [domainId, setDomainId] = useState(domains[0]?.id ?? '')
  const [localPart, setLocalPart] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [quotaMb, setQuotaMb] = useState('500')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedDomain = domains.find((d) => d.id === domainId)
  const fullAddress = localPart ? `${localPart}@${selectedDomain?.domain ?? ''}` : ''

  const generatePassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%'
    let pw = ''
    for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)]
    setPassword(pw)
    setShowPassword(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!localPart || !password || !domainId) return
    setSaving(true)
    setError('')
    try {
      await api.post('/api/mail/mailboxes', {
        domainId,
        localPart,
        password,
        displayName: displayName || undefined,
        quotaMb: parseInt(quotaMb) || 500,
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd tworzenia skrzynki')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Nowa skrzynka pocztowa" description="Utwórz konto e-mail">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {domains.length > 1 && (
          <Select label="Domena" value={domainId} onChange={(e) => setDomainId(e.target.value)}>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.domain}</option>)}
          </Select>
        )}

        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5 uppercase tracking-wider font-medium">
            Adres e-mail
          </label>
          <div className="flex items-center gap-2">
            <Input
              placeholder="jan.kowalski"
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
              icon={<Mail className="w-4 h-4" />}
            />
            <span className="text-sm text-[var(--text-muted)] flex-shrink-0">
              @{selectedDomain?.domain ?? '...'}
            </span>
          </div>
          {fullAddress && (
            <p className="mt-1 text-xs text-[var(--primary)]">{fullAddress}</p>
          )}
        </div>

        <Input
          label="Nazwa wyświetlana"
          placeholder="Jan Kowalski"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          icon={<User className="w-4 h-4" />}
        />

        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5 uppercase tracking-wider font-medium">
            Hasło
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 znaków"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock className="w-4 h-4" />}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button type="button" variant="secondary" onClick={generatePassword}>
              <Key className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Select label="Quota" value={quotaMb} onChange={(e) => setQuotaMb(e.target.value)}>
          <option value="100">100 MB</option>
          <option value="250">250 MB</option>
          <option value="500">500 MB</option>
          <option value="1024">1 GB</option>
          <option value="2048">2 GB</option>
          <option value="5120">5 GB</option>
        </Select>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Anuluj</Button>
          <Button type="submit" className="flex-1" loading={saving}>
            <Plus className="w-4 h-4" /> Utwórz
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Connection Info Modal ─────────────────────────────────────────────────────

function ConnectionInfoModal({ domain, onClose }: { domain: string; onClose: () => void }) {
  const mailHost = `mail.${domain}`

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <Modal open onClose={onClose} title="Dane do konfiguracji" description={`Ustawienia poczty dla ${domain}`}>
      <div className="space-y-5">
        {/* IMAP */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wider">Poczta przychodząca (IMAP)</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-[var(--text-muted)]">Serwer:</span>
            <button className="text-[var(--text-primary)] font-mono flex items-center gap-1 hover:text-[var(--primary)]" onClick={() => copyToClipboard(mailHost)}>
              {mailHost} <Copy className="w-3 h-3" />
            </button>
            <span className="text-[var(--text-muted)]">Port:</span>
            <span className="text-[var(--text-primary)] font-mono">993</span>
            <span className="text-[var(--text-muted)]">Szyfrowanie:</span>
            <span className="text-[var(--text-primary)]">SSL/TLS</span>
          </div>
        </div>

        {/* SMTP */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Poczta wychodząca (SMTP)</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-[var(--text-muted)]">Serwer:</span>
            <button className="text-[var(--text-primary)] font-mono flex items-center gap-1 hover:text-[var(--primary)]" onClick={() => copyToClipboard(mailHost)}>
              {mailHost} <Copy className="w-3 h-3" />
            </button>
            <span className="text-[var(--text-muted)]">Port:</span>
            <span className="text-[var(--text-primary)] font-mono">587</span>
            <span className="text-[var(--text-muted)]">Szyfrowanie:</span>
            <span className="text-[var(--text-primary)]">STARTTLS</span>
          </div>
        </div>

        {/* Webmail */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-xs font-semibold text-[var(--primary)] uppercase tracking-wider mb-2">Webmail</p>
          <a
            href={`https://webmail.${domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-[var(--primary)] hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            webmail.{domain}
          </a>
        </div>

        <Button variant="secondary" className="w-full" onClick={onClose}>Zamknij</Button>
      </div>
    </Modal>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function MailPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const { data: domains, loading: domainsLoading, refetch: refetchDomains } = useApi<MailDomainRecord[]>('/api/mail/domains')
  const { data: mailboxes, loading: mailboxesLoading, refetch: refetchMailboxes } = useApi<MailboxRecord[]>('/api/mail/mailboxes')
  const { data: statusData } = useApi<{ running: boolean }>('/api/mail/status')

  const [showCreateMailbox, setShowCreateMailbox] = useState(false)
  const [showConnectionInfo, setShowConnectionInfo] = useState<string | null>(null)
  const [enableDomain, setEnableDomain] = useState('')
  const [enablingDomain, setEnablingDomain] = useState(false)
  const [showEnableDomain, setShowEnableDomain] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const mailRunning = statusData?.running ?? false
  const domainList = domains ?? []
  const mailboxList = mailboxes ?? []

  const handleEnableDomain = async () => {
    if (!enableDomain) return
    setEnablingDomain(true)
    try {
      await api.post('/api/mail/domains', { domain: enableDomain })
      refetchDomains()
      setShowEnableDomain(false)
      setEnableDomain('')
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Błąd')
    } finally {
      setEnablingDomain(false)
    }
  }

  const handleDeleteDomain = async (id: string, domain: string) => {
    if (!confirm(`Usunąć domenę pocztową ${domain}? Wszystkie skrzynki zostaną usunięte.`)) return
    try {
      await api.delete(`/api/mail/domains/${id}`)
      refetchDomains()
      refetchMailboxes()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Błąd')
    }
  }

  const handleDeleteMailbox = async (id: string, address: string) => {
    if (!confirm(`Usunąć skrzynkę ${address}?`)) return
    try {
      await api.delete(`/api/mail/mailboxes/${id}`)
      refetchMailboxes()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Błąd')
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await api.post<{ domainsImported: number; mailboxesImported: number }>('/api/mail/sync', {})
      refetchDomains()
      refetchMailboxes()
      alert(`Synchronizacja zakończona: ${result.domainsImported} domen, ${result.mailboxesImported} skrzynek zaimportowano.`)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Błąd synchronizacji')
    } finally {
      setSyncing(false)
    }
  }

  const handleResetPassword = async (id: string, address: string) => {
    const newPassword = prompt(`Nowe hasło dla ${address}:`)
    if (!newPassword || newPassword.length < 8) {
      if (newPassword) alert('Hasło musi mieć min. 8 znaków')
      return
    }
    try {
      await api.post(`/api/mail/mailboxes/${id}/password`, { password: newPassword })
      alert('Hasło zmienione')
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Błąd')
    }
  }

  return (
    <div className="min-h-screen">
      <Topbar title="Poczta e-mail" subtitle={`${mailboxList.length} skrzynek · ${domainList.length} domen`} />

      <div className="p-6 space-y-6">

        {/* Status */}
        {!mailRunning && (
          <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-400">Serwer poczty nie jest uruchomiony</p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                Zainstaluj Stalwart Mail Server: <code className="bg-white/10 px-1.5 py-0.5 rounded">docker pull stalwartlabs/mail-server:latest</code>
              </p>
            </div>
          </div>
        )}

        {/* Mail Domains */}
        <Card>
          <CardHeader>
            <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
              <Globe className="w-4 h-4 text-[var(--primary)]" />
            </div>
            <CardTitle>Domeny pocztowe</CardTitle>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => refetchDomains()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              {isAdmin && (
                <>
                  <Button variant="secondary" size="sm" onClick={handleSync} loading={syncing} title="Importuj domeny i skrzynki ze Stalwarta">
                    <Download className="w-4 h-4" /> Synchronizuj
                  </Button>
                  <Button size="sm" onClick={() => setShowEnableDomain(true)}>
                    <Plus className="w-4 h-4" /> Włącz pocztę
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {domainList.length === 0 ? (
              <EmptyState icon={Globe} title="Brak domen pocztowych" description="Włącz pocztę dla domeny aby tworzyć skrzynki" />
            ) : (
              <div className="space-y-2">
                {domainList.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                    <Mail className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{d.domain}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <DnsBadge label="MX" ok={d.mxConfigured} />
                        <DnsBadge label="SPF" ok={d.spfConfigured} />
                        <DnsBadge label="DKIM" ok={d.dkimConfigured} />
                        <DnsBadge label="DMARC" ok={d.dmarcConfigured} />
                      </div>
                    </div>
                    <Badge variant="neutral">{d._count.mailboxes} skrzynek</Badge>
                    <Button variant="secondary" size="sm" onClick={() => setShowConnectionInfo(d.domain)} title="Dane połączenia">
                      <Server className="w-4 h-4" />
                    </Button>
                    {isAdmin && (
                      <Button variant="danger" size="sm" onClick={() => handleDeleteDomain(d.id, d.domain)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mailboxes */}
        <Card>
          <CardHeader>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-blue-400" />
            </div>
            <CardTitle>Skrzynki pocztowe</CardTitle>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => refetchMailboxes()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              {domainList.length > 0 && (
                <Button size="sm" onClick={() => setShowCreateMailbox(true)}>
                  <Plus className="w-4 h-4" /> Nowa skrzynka
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {mailboxList.length === 0 ? (
              <EmptyState icon={Mail} title="Brak skrzynek pocztowych" description="Utwórz pierwszą skrzynkę e-mail" />
            ) : (
              <div className="space-y-1">
                {/* Header */}
                <div className="hidden md:flex items-center gap-4 px-4 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                  <span className="flex-1">Adres</span>
                  <span className="w-28">Domena</span>
                  <span className="w-20">Quota</span>
                  <span className="w-28">Utworzono</span>
                  <span className="w-24">Status</span>
                  <span className="w-28">Akcje</span>
                </div>
                {mailboxList.map((m) => (
                  <div key={m.id} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{m.address}</p>
                      {m.displayName && (
                        <p className="text-xs text-[var(--text-muted)] truncate">{m.displayName}</p>
                      )}
                    </div>
                    <span className="hidden md:block w-28 text-xs text-[var(--text-muted)]">{m.domain.domain}</span>
                    <span className="hidden md:block w-20 text-xs text-[var(--text-muted)]">{m.quotaMb >= 1024 ? `${(m.quotaMb / 1024).toFixed(0)} GB` : `${m.quotaMb} MB`}</span>
                    <span className="hidden md:block w-28 text-xs text-[var(--text-muted)]">{formatDate(m.createdAt)}</span>
                    <div className="w-24">
                      <Badge variant={m.isActive ? 'success' : 'error'}>
                        {m.isActive ? 'Aktywna' : 'Nieaktywna'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 w-28">
                      <Button variant="secondary" size="sm" onClick={() => handleResetPassword(m.id, m.address)} title="Zmień hasło">
                        <Key className="w-4 h-4" />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDeleteMailbox(m.id, m.address)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      {showCreateMailbox && domainList.length > 0 && (
        <CreateMailboxModal
          domains={domainList}
          onClose={() => setShowCreateMailbox(false)}
          onSuccess={() => refetchMailboxes()}
        />
      )}

      {showConnectionInfo && (
        <ConnectionInfoModal
          domain={showConnectionInfo}
          onClose={() => setShowConnectionInfo(null)}
        />
      )}

      {showEnableDomain && (
        <Modal open onClose={() => setShowEnableDomain(false)} title="Włącz pocztę dla domeny">
          <div className="space-y-4">
            <Input
              label="Domena"
              placeholder="example.com"
              value={enableDomain}
              onChange={(e) => setEnableDomain(e.target.value)}
              icon={<Globe className="w-4 h-4" />}
            />
            <p className="text-xs text-[var(--text-muted)]">
              Automatycznie skonfiguruje rekordy DNS: MX, SPF, DKIM, DMARC
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowEnableDomain(false)}>Anuluj</Button>
              <Button className="flex-1" onClick={handleEnableDomain} loading={enablingDomain}>Włącz pocztę</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
