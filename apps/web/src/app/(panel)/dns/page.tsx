'use client'

import { useState } from 'react'
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
import {
  Cloud, Plus, Trash2, RefreshCw, Shield, ChevronDown,
  CheckCircle2, AlertCircle, Key, Globe, Pencil,
} from 'lucide-react'

interface CfZone { id: string; name: string; status: string; plan: { name: string } }
interface CfToken { id: string; label: string; isDefault: boolean; createdAt: string }
interface DnsRecord {
  id: string; type: string; name: string; content: string
  ttl: number; proxied: boolean; modified_on: string
}

const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'CAA'] as const

export default function DnsPage() {
  const { data: tokens, refetch: refetchTokens } = useApi<CfToken[]>('/api/dns/tokens')
  const { data: zones, loading: zonesLoading, error: zonesError, refetch: refetchZones } = useApi<CfZone[]>('/api/dns/zones')

  const [selectedZone, setSelectedZone] = useState<CfZone | null>(null)
  const [records, setRecords] = useState<DnsRecord[] | null>(null)
  const [loadingRecords, setLoadingRecords] = useState(false)

  const [showAddToken, setShowAddToken] = useState(false)
  const [showAddRecord, setShowAddRecord] = useState(false)
  const [tokenForm, setTokenForm] = useState({ label: 'Cloudflare API', token: '' })
  const [savingToken, setSavingToken] = useState(false)
  const [tokenError, setTokenError] = useState('')

  const [recordForm, setRecordForm] = useState({
    type: 'A', name: '', content: '', ttl: 3600, proxied: true,
  })
  const [savingRecord, setSavingRecord] = useState(false)
  const [deletingRecord, setDeletingRecord] = useState<string | null>(null)
  const [editRecord, setEditRecord] = useState<DnsRecord | null>(null)
  const [editForm, setEditForm] = useState({ type: 'A', name: '', content: '', ttl: 3600, proxied: true })
  const [savingEdit, setSavingEdit] = useState(false)

  // Token exists if user has DB tokens OR if zones loaded (env var fallback works)
  const hasToken = (tokens ?? []).length > 0 || (zones !== undefined && zones !== null && !zonesError)

  const loadRecords = async (zone: CfZone) => {
    setSelectedZone(zone)
    setLoadingRecords(true)
    try {
      const data = await api.get<DnsRecord[]>(`/api/dns/zones/${zone.id}/records`)
      setRecords(data)
    } catch {
      setRecords([])
    } finally {
      setLoadingRecords(false)
    }
  }

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault()
    setTokenError('')
    setSavingToken(true)
    try {
      await api.post('/api/dns/tokens', tokenForm)
      refetchTokens()
      refetchZones()
      setShowAddToken(false)
      setTokenForm({ label: 'Cloudflare API', token: '' })
    } catch (err) {
      setTokenError(err instanceof ApiError ? err.message : 'Błąd')
    } finally {
      setSavingToken(false)
    }
  }

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedZone) return
    setSavingRecord(true)
    try {
      const record = await api.post<DnsRecord>(`/api/dns/zones/${selectedZone.id}/records`, recordForm)
      setRecords((prev) => prev ? [record, ...prev] : [record])
      setShowAddRecord(false)
      setRecordForm({ type: 'A', name: '', content: '', ttl: 3600, proxied: true })
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Błąd dodawania rekordu')
    } finally {
      setSavingRecord(false)
    }
  }

  const handleDeleteRecord = async (recordId: string) => {
    if (!selectedZone || !confirm('Usunąć rekord DNS?')) return
    setDeletingRecord(recordId)
    try {
      await api.delete(`/api/dns/zones/${selectedZone.id}/records/${recordId}`)
      setRecords((prev) => prev?.filter((r) => r.id !== recordId) ?? null)
    } finally {
      setDeletingRecord(null)
    }
  }

  const openEditRecord = (record: DnsRecord) => {
    setEditRecord(record)
    setEditForm({ type: record.type, name: record.name, content: record.content, ttl: record.ttl, proxied: record.proxied })
  }

  const handleEditRecord = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedZone || !editRecord) return
    setSavingEdit(true)
    try {
      const updated = await api.put<DnsRecord>(`/api/dns/zones/${selectedZone.id}/records/${editRecord.id}`, editForm)
      setRecords((prev) => prev?.map((r) => r.id === updated.id ? updated : r) ?? null)
      setEditRecord(null)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Błąd aktualizacji rekordu')
    } finally {
      setSavingEdit(false)
    }
  }

  const toggleProxy = async (record: DnsRecord) => {
    if (!selectedZone || record.type === 'MX' || record.type === 'TXT') return
    try {
      const updated = await api.patch<DnsRecord>(
        `/api/dns/zones/${selectedZone.id}/records/${record.id}`,
        { proxied: !record.proxied }
      )
      setRecords((prev) => prev?.map((r) => r.id === updated.id ? updated : r) ?? null)
    } catch {
      alert('Błąd aktualizacji rekordu')
    }
  }

  // Badge kolory per typ rekordu
  const typeColor: Record<string, string> = {
    A: 'text-[var(--primary)] bg-[var(--primary)]/10 border-[var(--primary)]/20',
    AAAA: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    CNAME: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    MX: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    TXT: 'text-green-400 bg-green-500/10 border-green-500/20',
    CAA: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    NS: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  }

  return (
    <div className="min-h-screen">
      <Topbar title="DNS / Cloudflare" subtitle="Zarządzanie strefami i rekordami DNS" />

      <div className="p-6 space-y-5">

        {/* Token section */}
        {!hasToken ? (
          <Card className="border-[var(--primary)]/20">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl gradient-brand flex items-center justify-center flex-shrink-0 glow-pink">
                <Cloud className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Połącz z Cloudflare</h3>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  Dodaj API Token Cloudflare aby zarządzać strefami DNS i automatycznie wystawiać certyfikaty Origin.
                  Token musi mieć uprawnienia: <code className="text-[var(--primary)]">Zone:DNS:Edit</code> i <code className="text-[var(--primary)]">Zone:Zone:Read</code>.
                </p>
                <Button onClick={() => setShowAddToken(true)}>
                  <Key className="w-4 h-4" /> Dodaj API Token
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-xl glass border border-green-500/20">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <span className="text-sm text-[var(--text-secondary)] flex-1">
              Cloudflare połączony · Token: <strong className="text-[var(--text-primary)]">{tokens![0]!.label}</strong>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setShowAddToken(true)}>
              <Key className="w-4 h-4" /> Zmień
            </Button>
          </div>
        )}

        {/* Zones + Records */}
        {hasToken && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Zone list */}
            <Card className="lg:col-span-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Strefy DNS</h3>
                <Button variant="ghost" size="sm" onClick={refetchZones}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {zonesLoading && (
                <div className="py-8 flex justify-center">
                  <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {zonesError && (
                <div className="flex items-center gap-2 text-sm text-red-400 py-4">
                  <AlertCircle className="w-4 h-4" /> {zonesError}
                </div>
              )}

              {!zonesLoading && !zonesError && (zones ?? []).length === 0 && (
                <EmptyState icon={Globe} title="Brak stref" description="Dodaj domeny do Cloudflare" />
              )}

              <div className="space-y-1">
                {(zones ?? []).map((zone) => (
                  <button
                    key={zone.id}
                    onClick={() => loadRecords(zone)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                      selectedZone?.id === zone.id
                        ? 'gradient-subtle border border-[var(--primary)]/20'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${zone.status === 'active' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{zone.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{zone.plan.name}</p>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] -rotate-90" />
                  </button>
                ))}
              </div>
            </Card>

            {/* Records */}
            <Card className="lg:col-span-2 p-0 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {selectedZone ? `Rekordy DNS — ${selectedZone.name}` : 'Rekordy DNS'}
                  </h3>
                  {records && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{records.length} rekordów</p>
                  )}
                </div>
                {selectedZone && (
                  <Button size="sm" onClick={() => setShowAddRecord(true)}>
                    <Plus className="w-4 h-4" /> Dodaj rekord
                  </Button>
                )}
              </div>

              {!selectedZone && (
                <EmptyState icon={Cloud} title="Wybierz strefę" description="Kliknij strefę z listy aby zobaczyć rekordy DNS" />
              )}

              {selectedZone && loadingRecords && (
                <div className="py-12 flex justify-center">
                  <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {selectedZone && !loadingRecords && records && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['Typ', 'Nazwa', 'Treść', 'TTL', 'Proxy', ''].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr key={record.id} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] group">
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold border ${typeColor[record.type] ?? typeColor['NS']!}`}>
                              {record.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)] max-w-[140px] truncate">{record.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)] max-w-[160px] truncate">{record.content}</td>
                          <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                            {record.ttl === 1 ? 'Auto' : `${record.ttl}s`}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleProxy(record)}
                              title={record.proxied ? 'Proxied (pomarańcza)' : 'DNS only (szara)'}
                              disabled={record.type === 'MX' || record.type === 'TXT' || record.type === 'CAA'}
                              className="disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              {record.proxied ? (
                                <div className="flex items-center gap-1 text-[10px] text-orange-400">
                                  <span className="text-base">🟠</span> Proxied
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                                  <span className="text-base">⚪</span> DNS only
                                </div>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openEditRecord(record)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                loading={deletingRecord === record.id}
                                onClick={() => handleDeleteRecord(record.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Add token modal */}
      <Modal open={showAddToken} onClose={() => setShowAddToken(false)} title="Cloudflare API Token" description="Token musi mieć uprawnienia Zone:DNS:Edit i Zone:Zone:Read">
        {tokenError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{tokenError}</div>
        )}
        <form onSubmit={handleSaveToken} className="space-y-4">
          <Input label="Etykieta" value={tokenForm.label} onChange={(e) => setTokenForm((f) => ({ ...f, label: e.target.value }))} required />
          <Input label="API Token" type="password" placeholder="xxxxx..." value={tokenForm.token} onChange={(e) => setTokenForm((f) => ({ ...f, token: e.target.value }))} icon={<Key className="w-4 h-4" />} required />
          <p className="text-xs text-[var(--text-muted)]">
            Utwórz token na{' '}
            <span className="text-[var(--primary)]">dash.cloudflare.com → My Profile → API Tokens</span>
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowAddToken(false)}>Anuluj</Button>
            <Button type="submit" className="flex-1" loading={savingToken}>{!savingToken && 'Zapisz i zweryfikuj'}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit record modal */}
      <Modal
        open={!!editRecord}
        onClose={() => setEditRecord(null)}
        title="Edytuj rekord DNS"
        description={editRecord ? `Rekord: ${editRecord.type} ${editRecord.name}` : ''}
      >
        <form onSubmit={handleEditRecord} className="space-y-4">
          <Select
            label="Typ rekordu"
            value={editForm.type}
            onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
          >
            {DNS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input
            label="Nazwa (@ = apex)"
            placeholder="@ lub subdomena"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label={editForm.type === 'MX' ? 'Serwer mailowy' : 'Wartość / IP'}
            placeholder={editForm.type === 'A' ? '1.2.3.4' : editForm.type === 'CNAME' ? 'target.com' : ''}
            value={editForm.content}
            onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
            required
          />
          <Select
            label="TTL"
            value={String(editForm.ttl)}
            onChange={(e) => setEditForm((f) => ({ ...f, ttl: Number(e.target.value) }))}
          >
            <option value="1">Auto (Cloudflare)</option>
            <option value="300">5 minut</option>
            <option value="3600">1 godzina</option>
            <option value="86400">1 dzień</option>
          </Select>

          {['A', 'AAAA', 'CNAME'].includes(editForm.type) && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Proxy Cloudflare</p>
                <p className="text-xs text-[var(--text-muted)]">🟠 Pomarańcza = CDN + DDoS ochrona</p>
              </div>
              <button
                type="button"
                onClick={() => setEditForm((f) => ({ ...f, proxied: !f.proxied }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${editForm.proxied ? 'bg-orange-400' : 'bg-white/10'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${editForm.proxied ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditRecord(null)}>Anuluj</Button>
            <Button type="submit" className="flex-1" loading={savingEdit}>{!savingEdit && 'Zapisz zmiany'}</Button>
          </div>
        </form>
      </Modal>

      {/* Add record modal */}
      <Modal open={showAddRecord} onClose={() => setShowAddRecord(false)} title="Nowy rekord DNS">
        <form onSubmit={handleAddRecord} className="space-y-4">
          <Select
            label="Typ rekordu"
            value={recordForm.type}
            onChange={(e) => setRecordForm((f) => ({ ...f, type: e.target.value }))}
          >
            {DNS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input label="Nazwa (@ = apex)" placeholder={`@ lub subdomena`} value={recordForm.name} onChange={(e) => setRecordForm((f) => ({ ...f, name: e.target.value }))} required />
          <Input
            label={recordForm.type === 'MX' ? 'Serwer mailowy' : 'Wartość / IP'}
            placeholder={recordForm.type === 'A' ? '1.2.3.4' : recordForm.type === 'CNAME' ? 'target.com' : ''}
            value={recordForm.content}
            onChange={(e) => setRecordForm((f) => ({ ...f, content: e.target.value }))}
            required
          />
          <Select label="TTL" value={String(recordForm.ttl)} onChange={(e) => setRecordForm((f) => ({ ...f, ttl: Number(e.target.value) }))}>
            <option value="1">Auto (Cloudflare)</option>
            <option value="300">5 minut</option>
            <option value="3600">1 godzina</option>
            <option value="86400">1 dzień</option>
          </Select>

          {['A', 'AAAA', 'CNAME'].includes(recordForm.type) && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Proxy Cloudflare</p>
                <p className="text-xs text-[var(--text-muted)]">🟠 Pomarańcza = CDN + DDoS ochrona</p>
              </div>
              <button
                type="button"
                onClick={() => setRecordForm((f) => ({ ...f, proxied: !f.proxied }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${recordForm.proxied ? 'bg-orange-400' : 'bg-white/10'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${recordForm.proxied ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowAddRecord(false)}>Anuluj</Button>
            <Button type="submit" className="flex-1" loading={savingRecord}>{!savingRecord && 'Dodaj rekord'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
