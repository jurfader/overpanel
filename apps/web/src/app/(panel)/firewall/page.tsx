'use client'

import { useState, useEffect, useRef } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { useApi } from '@/hooks/use-api'
import { api } from '@/lib/api'
import {
  Shield,
  ShieldOff,
  ShieldCheck,
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  Globe,
  Lock,
  Database,
  Server,
} from 'lucide-react'

interface UfwRule {
  number: number
  to: string
  action: string
  from: string
  protocol?: string
}

interface UfwStatus {
  enabled: boolean
  rules: UfwRule[]
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

const PRESETS = [
  { label: 'SSH', port: '22', proto: 'tcp', icon: Lock },
  { label: 'HTTP', port: '80', proto: 'tcp', icon: Globe },
  { label: 'HTTPS', port: '443', proto: 'tcp', icon: ShieldCheck },
  { label: 'MySQL', port: '3306', proto: 'tcp', icon: Database },
  { label: 'PostgreSQL', port: '5432', proto: 'tcp', icon: Database },
  { label: 'FTP', port: '21', proto: 'tcp', icon: Server },
]

function getActionVariant(action: string): 'success' | 'error' | 'warning' | 'neutral' {
  const a = action.toUpperCase()
  if (a.includes('ALLOW')) return 'success'
  if (a.includes('DENY')) return 'error'
  if (a.includes('REJECT')) return 'warning'
  return 'neutral'
}

function getActionLabel(action: string): string {
  const a = action.toUpperCase()
  if (a.includes('ALLOW')) return 'ALLOW'
  if (a.includes('DENY')) return 'DENY'
  if (a.includes('REJECT')) return 'REJECT'
  return action
}

let toastCounter = 0

export default function FirewallPage() {
  const { data, loading, error, refetch } = useApi<UfwStatus>('/api/firewall')

  // Status toggle
  const [togglingFirewall, setTogglingFirewall] = useState(false)

  // Preset loading map: port -> loading bool
  const [presetLoading, setPresetLoading] = useState<Record<string, boolean>>({})

  // Add rule form
  const [formPort, setFormPort] = useState('')
  const [formProto, setFormProto] = useState('tcp')
  const [formAction, setFormAction] = useState('allow')
  const [formFrom, setFormFrom] = useState('')
  const [addingRule, setAddingRule] = useState(false)

  // Delete loading map: rule number -> bool
  const [deletingRule, setDeletingRule] = useState<Record<number, boolean>>({})

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const pushToast = (message: string, type: 'success' | 'error') => {
    const id = ++toastCounter
    setToasts((prev) => [...prev, { id, message, type }])
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      toastTimers.current.delete(id)
    }, 3000)
    toastTimers.current.set(id, timer)
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      toastTimers.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  const rules = data?.rules ?? []
  const enabled = data?.enabled ?? false

  const handleToggleFirewall = async () => {
    setTogglingFirewall(true)
    try {
      await api.post(enabled ? '/api/firewall/disable' : '/api/firewall/enable')
      refetch()
      pushToast(enabled ? 'Zapora wyłączona' : 'Zapora włączona', 'success')
    } catch {
      pushToast('Błąd podczas zmiany stanu zapory', 'error')
    } finally {
      setTogglingFirewall(false)
    }
  }

  const handlePreset = async (preset: (typeof PRESETS)[number]) => {
    setPresetLoading((prev) => ({ ...prev, [preset.port]: true }))
    try {
      await api.post('/api/firewall/rules', {
        port: preset.port,
        protocol: preset.proto,
        action: 'allow',
        from: 'any',
      })
      refetch()
      pushToast(`Reguła ${preset.label} (${preset.port}/tcp) dodana`, 'success')
    } catch {
      pushToast(`Błąd podczas dodawania reguły ${preset.label}`, 'error')
    } finally {
      setPresetLoading((prev) => ({ ...prev, [preset.port]: false }))
    }
  }

  const handleAddRule = async () => {
    if (!formPort.trim()) return
    setAddingRule(true)
    try {
      await api.post('/api/firewall/rules', {
        port: formPort.trim(),
        protocol: formProto,
        action: formAction,
        from: formFrom.trim() || 'any',
      })
      refetch()
      pushToast(`Reguła dla portu ${formPort} dodana`, 'success')
      setFormPort('')
      setFormProto('tcp')
      setFormAction('allow')
      setFormFrom('')
    } catch {
      pushToast('Błąd podczas dodawania reguły', 'error')
    } finally {
      setAddingRule(false)
    }
  }

  const handleDeleteRule = async (ruleNumber: number) => {
    setDeletingRule((prev) => ({ ...prev, [ruleNumber]: true }))
    try {
      await api.delete(`/api/firewall/rules/${ruleNumber}`)
      refetch()
      pushToast(`Reguła #${ruleNumber} usunięta`, 'success')
    } catch {
      pushToast(`Błąd podczas usuwania reguły #${ruleNumber}`, 'error')
    } finally {
      setDeletingRule((prev) => ({ ...prev, [ruleNumber]: false }))
    }
  }

  return (
    <div className="min-h-screen">
      <Topbar title="Firewall (UFW)" subtitle="Zarządzaj regułami zapory sieciowej" />

      <div className="p-6 space-y-5">
        {/* Status bar */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                  enabled
                    ? 'bg-green-500/10 shadow-[0_0_16px_rgba(34,197,94,0.2)]'
                    : 'bg-red-500/10'
                }`}
              >
                {enabled ? (
                  <ShieldCheck className="w-5 h-5 text-green-400" />
                ) : (
                  <ShieldOff className="w-5 h-5 text-red-400" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1">
                  Stan zapory
                </p>
                {loading ? (
                  <div className="w-20 h-5 rounded-lg bg-white/5 animate-pulse" />
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border transition-all ${
                      enabled
                        ? 'bg-green-500/10 text-green-400 border-green-500/25 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                        : 'bg-red-500/10 text-red-400 border-red-500/25'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        enabled ? 'bg-green-400 shadow-[0_0_4px_rgba(34,197,94,0.8)]' : 'bg-red-400'
                      }`}
                    />
                    {enabled ? 'Aktywna' : 'Nieaktywna'}
                  </span>
                )}
              </div>
              {!loading && (
                <p className="ml-2 text-sm text-[var(--text-muted)]">
                  {rules.length} {rules.length === 1 ? 'reguła' : rules.length < 5 ? 'reguły' : 'reguł'}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={refetch} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant={enabled ? 'danger' : 'primary'}
                size="sm"
                onClick={handleToggleFirewall}
                loading={togglingFirewall}
                disabled={loading}
              >
                {enabled ? (
                  <>
                    <ShieldOff className="w-4 h-4" /> Wyłącz zaporę
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" /> Włącz zaporę
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Quick presets */}
        <Card className="p-4">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            Szybkie reguły
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const Icon = preset.icon
              return (
                <button
                  key={preset.port}
                  onClick={() => handlePreset(preset)}
                  disabled={!!presetLoading[preset.port]}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all
                    glass text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                    hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5
                    hover:shadow-[0_0_12px_rgba(233,30,140,0.1)]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    border border-white/10"
                >
                  {presetLoading[preset.port] ? (
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  <span>{preset.label}</span>
                  <span className="text-xs text-[var(--text-muted)] font-mono">{preset.port}</span>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Add rule form */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg gradient-subtle border border-[var(--primary)]/20 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-[var(--primary)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Dodaj regułę</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <Input
              label="Port"
              placeholder="80 lub 8080:8090"
              value={formPort}
              onChange={(e) => setFormPort(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
            />

            <Select
              label="Protokół"
              value={formProto}
              onChange={(e) => setFormProto(e.target.value)}
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
              <option value="any">Any</option>
            </Select>

            <Select
              label="Akcja"
              value={formAction}
              onChange={(e) => setFormAction(e.target.value)}
            >
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="reject">Reject</option>
            </Select>

            <Input
              label="Źródło (opcjonalne)"
              placeholder="any lub 192.168.1.0/24"
              value={formFrom}
              onChange={(e) => setFormFrom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
            />
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleAddRule}
              loading={addingRule}
              disabled={!formPort.trim()}
            >
              <Zap className="w-4 h-4" />
              Dodaj regułę
            </Button>
          </div>
        </Card>

        {/* Rules table */}
        <Card className="p-0 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.06] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            <span className="w-8 text-center">#</span>
            <span className="flex-1">Port / Usługa</span>
            <span className="hidden sm:block w-28">Akcja</span>
            <span className="hidden md:block w-44">Źródło</span>
            <span className="w-10" />
          </div>

          {/* Loading */}
          {loading && (
            <div className="py-14 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="py-10 flex flex-col items-center justify-center gap-2">
              <ShieldOff className="w-8 h-8 text-red-400" />
              <p className="text-sm text-red-400 font-medium">Nie można załadować reguł</p>
              <p className="text-xs text-[var(--text-muted)]">{error}</p>
              <Button variant="secondary" size="sm" onClick={refetch} className="mt-2">
                <RefreshCw className="w-4 h-4" /> Spróbuj ponownie
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && rules.length === 0 && (
            <EmptyState
              icon={Shield}
              title="Brak reguł zapory"
              description="Dodaj pierwszą regułę korzystając z szybkich presetów lub formularza powyżej"
            />
          )}

          {/* Rule rows */}
          {!loading && !error && rules.map((rule) => {
            const actionVariant = getActionVariant(rule.action)
            const actionLabel = getActionLabel(rule.action)
            const isDeleting = !!deletingRule[rule.number]

            return (
              <div
                key={rule.number}
                className="flex items-center gap-4 px-4 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] group transition-colors"
              >
                {/* Number */}
                <div className="w-8 text-center flex-shrink-0">
                  <span className="text-xs font-mono text-[var(--text-muted)]">{rule.number}</span>
                </div>

                {/* Port / Service */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] font-mono truncate">
                    {rule.to}
                  </p>
                  {rule.protocol && (
                    <p className="text-xs text-[var(--text-muted)] uppercase">{rule.protocol}</p>
                  )}
                </div>

                {/* Action badge */}
                <div className="hidden sm:block w-28 flex-shrink-0">
                  <Badge variant={actionVariant}>
                    {actionVariant === 'success' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_4px_rgba(34,197,94,0.7)]" />
                    )}
                    {actionVariant === 'error' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    )}
                    {actionVariant === 'warning' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    )}
                    {actionLabel}
                  </Badge>
                </div>

                {/* Source */}
                <div className="hidden md:block w-44 flex-shrink-0">
                  <span className="text-sm text-[var(--text-secondary)] font-mono truncate block">
                    {rule.from || 'Anywhere'}
                  </span>
                </div>

                {/* Delete button */}
                <div className="w-10 flex-shrink-0 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteRule(rule.number)}
                    loading={isDeleting}
                    title={`Usuń regułę #${rule.number}`}
                    className="w-8 h-8 p-0"
                  >
                    {!isDeleting && <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            )
          })}
        </Card>
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-300
              ${
                toast.type === 'success'
                  ? 'bg-green-500/10 border-green-500/25 text-green-300 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
                  : 'bg-red-500/10 border-red-500/25 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
              }`}
          >
            {toast.type === 'success' ? (
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ShieldOff className="w-4 h-4 flex-shrink-0" />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}
