'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useApi } from '@/hooks/use-api'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  Settings,
  Mail,
  Users,
  ClipboardList,
  Save,
  TestTube2,
  Shield,
  Globe,
  Server,
  Lock,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Activity,
  Database,
  Globe2,
  Layers,
  Key,
  Cpu,
  FileText,
  Palette,
  Image,
  Cloud,
  HardDrive,
  AlertTriangle,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'general' | 'smtp' | 'limits' | 'audit' | 'appearance' | 'integrations'

interface AuditEntry {
  id: string
  action: string
  resource: string | null
  resourceId: string | null
  meta: string | null
  ip: string | null
  createdAt: string
  user: { name: string; email: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActionBadgeClass(action: string): string {
  const prefix = action.split('.')[0] ?? ''
  switch (prefix) {
    case 'site':
      return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
    case 'db':
      return 'bg-green-500/10 text-green-400 border border-green-500/20'
    case 'user':
      return 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
    case 'auth':
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
    case 'wordpress':
      return 'bg-[#21759b]/10 text-[#4fa6c8] border border-[#21759b]/30'
    default:
      return 'bg-white/5 text-[var(--text-secondary)] border border-white/10'
  }
}

function getActionIcon(action: string) {
  const prefix = action.split('.')[0] ?? ''
  switch (prefix) {
    case 'site':
      return <Globe2 className="w-3 h-3" />
    case 'db':
      return <Database className="w-3 h-3" />
    case 'user':
      return <Users className="w-3 h-3" />
    case 'auth':
      return <Shield className="w-3 h-3" />
    case 'wordpress':
      return <Layers className="w-3 h-3" />
    default:
      return <Activity className="w-3 h-3" />
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastState {
  visible: boolean
  message: string
  type: 'success' | 'error'
}

function useToast() {
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ visible: true, message, type })
    timerRef.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000)
  }, [])

  return { toast, show }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const { toast, show: showToast } = useToast()

  // Fetch all settings once
  const { data: settingsData, loading: settingsLoading } = useApi<Record<string, string>>('/api/settings')

  // ── General form state ──────────────────────────────────────────────────────
  const [general, setGeneral] = useState({ panel_name: '', panel_url: '' })
  const [savingGeneral, setSavingGeneral] = useState(false)

  // ── SMTP form state ─────────────────────────────────────────────────────────
  const [smtp, setSmtp] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    smtp_from: '',
    smtp_secure: 'false',
  })
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  // ── Limits form state ───────────────────────────────────────────────────────
  const [limits, setLimits] = useState({ max_sites_per_user: '', max_dbs_per_user: '' })
  const [savingLimits, setSavingLimits] = useState(false)

  // ── Appearance form state ────────────────────────────────────────────────────
  const [appearance, setAppearance] = useState({ panel_logo_url: '', panel_favicon_url: '' })
  const [savingAppearance, setSavingAppearance] = useState(false)

  // ── CF global token state ────────────────────────────────────────────────────
  const [cfToken, setCfToken] = useState({ cf_global_token: '' })
  const [savingCfToken, setSavingCfToken] = useState(false)

  // ── S3 / Backblaze B2 state ──────────────────────────────────────────────────
  const [s3, setS3] = useState({
    s3_endpoint: '',
    s3_bucket: '',
    s3_access_key: '',
    s3_secret_key: '',
    s3_region: '',
  })
  const [savingS3, setSavingS3] = useState(false)

  // ── Audit log ───────────────────────────────────────────────────────────────
  const {
    data: auditData,
    loading: auditLoading,
    refetch: refetchAudit,
  } = useApi<AuditEntry[]>(activeTab === 'audit' ? '/api/settings/audit-log' : '')

  // Auto-refresh audit log every 30s when on the audit tab
  useEffect(() => {
    if (activeTab !== 'audit') return
    const interval = setInterval(() => refetchAudit(), 30_000)
    return () => clearInterval(interval)
  }, [activeTab, refetchAudit])

  // Trigger a refetch when switching to audit tab
  useEffect(() => {
    if (activeTab === 'audit') refetchAudit()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Populate form fields when settings load
  useEffect(() => {
    if (!settingsData) return
    setGeneral({
      panel_name: settingsData['panel_name'] ?? '',
      panel_url: settingsData['panel_url'] ?? '',
    })
    setSmtp({
      smtp_host: settingsData['smtp_host'] ?? '',
      smtp_port: settingsData['smtp_port'] ?? '587',
      smtp_user: settingsData['smtp_user'] ?? '',
      smtp_password: '', // never pre-filled
      smtp_from: settingsData['smtp_from'] ?? '',
      smtp_secure: settingsData['smtp_secure'] ?? 'false',
    })
    setLimits({
      max_sites_per_user: settingsData['max_sites_per_user'] ?? '',
      max_dbs_per_user: settingsData['max_dbs_per_user'] ?? '',
    })
    setAppearance({
      panel_logo_url: settingsData['panel_logo_url'] ?? '',
      panel_favicon_url: settingsData['panel_favicon_url'] ?? '',
    })
    setCfToken({
      cf_global_token: settingsData['cf_global_token'] ?? '',
    })
    setS3({
      s3_endpoint: settingsData['s3_endpoint'] ?? '',
      s3_bucket: settingsData['s3_bucket'] ?? '',
      s3_access_key: settingsData['s3_access_key'] ?? '',
      s3_secret_key: '', // never pre-filled
      s3_region: settingsData['s3_region'] ?? '',
    })
  }, [settingsData])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSaveGeneral = async () => {
    setSavingGeneral(true)
    try {
      await api.post('/api/settings', {
        panel_name: general.panel_name,
        panel_url: general.panel_url,
      })
      showToast('Ustawienia ogólne zapisane')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Błąd zapisu', 'error')
    } finally {
      setSavingGeneral(false)
    }
  }

  const handleSaveSmtp = async () => {
    setSavingSmtp(true)
    try {
      const payload: Record<string, string> = {
        smtp_host: smtp.smtp_host,
        smtp_port: smtp.smtp_port,
        smtp_user: smtp.smtp_user,
        smtp_from: smtp.smtp_from,
        smtp_secure: smtp.smtp_secure,
      }
      if (smtp.smtp_password) payload['smtp_password'] = smtp.smtp_password
      await api.post('/api/settings', payload)
      showToast('Ustawienia SMTP zapisane')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Błąd zapisu', 'error')
    } finally {
      setSavingSmtp(false)
    }
  }

  const handleTestSmtp = async () => {
    setTestingSmtp(true)
    setSmtpTestResult(null)
    try {
      const result = await api.get<{ success: boolean; error?: string }>('/api/settings/test-smtp')
      setSmtpTestResult(result)
    } catch (err) {
      setSmtpTestResult({ success: false, error: err instanceof ApiError ? err.message : 'Błąd testu' })
    } finally {
      setTestingSmtp(false)
    }
  }

  const handleSaveLimits = async () => {
    setSavingLimits(true)
    try {
      await api.post('/api/settings', {
        max_sites_per_user: limits.max_sites_per_user,
        max_dbs_per_user: limits.max_dbs_per_user,
      })
      showToast('Limity zapisane')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Błąd zapisu', 'error')
    } finally {
      setSavingLimits(false)
    }
  }

  const handleSaveAppearance = async () => {
    setSavingAppearance(true)
    try {
      await api.post('/api/settings', {
        panel_logo_url: appearance.panel_logo_url,
        panel_favicon_url: appearance.panel_favicon_url,
      })
      showToast('Ustawienia wyglądu zapisane')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Błąd zapisu', 'error')
    } finally {
      setSavingAppearance(false)
    }
  }

  const handleSaveCfToken = async () => {
    setSavingCfToken(true)
    try {
      await api.post('/api/settings', {
        cf_global_token: cfToken.cf_global_token,
      })
      showToast('Token Cloudflare zapisany')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Błąd zapisu', 'error')
    } finally {
      setSavingCfToken(false)
    }
  }

  const handleSaveS3 = async () => {
    setSavingS3(true)
    try {
      const payload: Record<string, string> = {
        s3_endpoint: s3.s3_endpoint,
        s3_bucket: s3.s3_bucket,
        s3_access_key: s3.s3_access_key,
        s3_region: s3.s3_region,
      }
      if (s3.s3_secret_key) payload['s3_secret_key'] = s3.s3_secret_key
      await api.post('/api/settings', payload)
      showToast('Konfiguracja S3 zapisana')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Błąd zapisu', 'error')
    } finally {
      setSavingS3(false)
    }
  }

  // ── Tab definitions ───────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'Ogólne', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'smtp', label: 'SMTP', icon: <Mail className="w-3.5 h-3.5" /> },
    { id: 'limits', label: 'Limity', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'appearance', label: 'Wygląd', icon: <Palette className="w-3.5 h-3.5" /> },
    { id: 'integrations', label: 'Integracje', icon: <HardDrive className="w-3.5 h-3.5" /> },
    { id: 'audit', label: 'Audit Log', icon: <ClipboardList className="w-3.5 h-3.5" /> },
  ]

  const smtpSecure = smtp.smtp_secure === 'true'

  return (
    <div className="min-h-screen">
      <Topbar title="Ustawienia" subtitle="Konfiguracja panelu" />

      {/* Toast notification */}
      <div
        className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${
          toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-lg backdrop-blur-xl ${
            toast.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {toast.type === 'success' ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.message}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Tab navigation */}
        <div className="flex items-center gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'gradient-brand text-white shadow-[0_0_15px_rgba(233,30,140,0.3)]'
                  : 'glass text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {settingsLoading && activeTab !== 'audit' && activeTab !== 'appearance' && activeTab !== 'integrations' && (
          <div className="py-12 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── TAB: Ogólne ─────────────────────────────────────────────────── */}
        {!settingsLoading && activeTab === 'general' && (
          <Card className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                <Globe className="w-4.5 h-4.5 text-[var(--primary)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Panel</p>
                <p className="text-xs text-[var(--text-muted)]">Podstawowe informacje o panelu</p>
              </div>
            </div>

            <div className="space-y-4">
              <Input
                label="Nazwa panelu"
                placeholder="OVERPANEL"
                value={general.panel_name}
                onChange={(e) => setGeneral((g) => ({ ...g, panel_name: e.target.value }))}
                icon={<Server className="w-4 h-4" />}
              />
              <Input
                label="URL panelu"
                placeholder="https://panel.example.com"
                value={general.panel_url}
                onChange={(e) => setGeneral((g) => ({ ...g, panel_url: e.target.value }))}
                icon={<Globe className="w-4 h-4" />}
              />
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={handleSaveGeneral} loading={savingGeneral}>
                <Save className="w-4 h-4" />
                Zapisz
              </Button>
            </div>
          </Card>
        )}

        {/* ── TAB: SMTP ───────────────────────────────────────────────────── */}
        {!settingsLoading && activeTab === 'smtp' && (
          <Card className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Mail className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Konfiguracja SMTP</p>
                <p className="text-xs text-[var(--text-muted)]">Ustawienia serwera poczty wychodzącej</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Input
                    label="SMTP Host"
                    placeholder="smtp.gmail.com"
                    value={smtp.smtp_host}
                    onChange={(e) => setSmtp((s) => ({ ...s, smtp_host: e.target.value }))}
                    icon={<Server className="w-4 h-4" />}
                  />
                </div>
                <Input
                  label="SMTP Port"
                  type="number"
                  placeholder="587"
                  value={smtp.smtp_port}
                  onChange={(e) => setSmtp((s) => ({ ...s, smtp_port: e.target.value }))}
                />
              </div>

              <Input
                label="Użytkownik"
                placeholder="noreply@example.com"
                value={smtp.smtp_user}
                onChange={(e) => setSmtp((s) => ({ ...s, smtp_user: e.target.value }))}
                icon={<Mail className="w-4 h-4" />}
              />

              <Input
                label="Hasło"
                type="password"
                placeholder="••••••••  (pozostaw puste, aby nie zmieniać)"
                value={smtp.smtp_password}
                onChange={(e) => setSmtp((s) => ({ ...s, smtp_password: e.target.value }))}
                icon={<Lock className="w-4 h-4" />}
              />

              <Input
                label="Adres nadawcy"
                placeholder="OVERPANEL <noreply@example.com>"
                value={smtp.smtp_from}
                onChange={(e) => setSmtp((s) => ({ ...s, smtp_from: e.target.value }))}
                icon={<Mail className="w-4 h-4" />}
              />

              {/* SSL/TLS toggle */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                  SSL / TLS
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSmtp((s) => ({ ...s, smtp_secure: s.smtp_secure === 'true' ? 'false' : 'true' }))
                  }
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    smtpSecure
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-white/5 border-white/10 text-[var(--text-secondary)]'
                  }`}
                >
                  {smtpSecure ? (
                    <ToggleRight className="w-5 h-5" />
                  ) : (
                    <ToggleLeft className="w-5 h-5" />
                  )}
                  {smtpSecure ? 'Włączone (SSL/TLS)' : 'Wyłączone (STARTTLS / brak)'}
                </button>
              </div>
            </div>

            {/* SMTP test result */}
            {smtpTestResult && (
              <div
                className={`mt-4 px-4 py-3 rounded-xl border text-sm ${
                  smtpTestResult.success
                    ? 'bg-green-500/10 border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}
              >
                {smtpTestResult.success
                  ? 'Połączenie SMTP nawiązane pomyślnie.'
                  : `Błąd: ${smtpTestResult.error ?? 'Nieznany błąd'}`}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={handleTestSmtp} loading={testingSmtp}>
                <TestTube2 className="w-4 h-4" />
                Test połączenia
              </Button>
              <Button onClick={handleSaveSmtp} loading={savingSmtp}>
                <Save className="w-4 h-4" />
                Zapisz
              </Button>
            </div>
          </Card>
        )}

        {/* ── TAB: Limity ─────────────────────────────────────────────────── */}
        {!settingsLoading && activeTab === 'limits' && (
          <Card className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Users className="w-4.5 h-4.5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Limity użytkowników</p>
                <p className="text-xs text-[var(--text-muted)]">Maksymalna liczba zasobów na konto</p>
              </div>
            </div>

            <div className="space-y-4">
              <Input
                label="Maks. stron na użytkownika"
                type="number"
                placeholder="10"
                value={limits.max_sites_per_user}
                onChange={(e) => setLimits((l) => ({ ...l, max_sites_per_user: e.target.value }))}
                icon={<Globe2 className="w-4 h-4" />}
              />
              <Input
                label="Maks. baz danych na użytkownika"
                type="number"
                placeholder="10"
                value={limits.max_dbs_per_user}
                onChange={(e) => setLimits((l) => ({ ...l, max_dbs_per_user: e.target.value }))}
                icon={<Database className="w-4 h-4" />}
              />
            </div>

            {/* Info note */}
            <div className="mt-4 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-[var(--text-muted)]">
              Pozostaw puste, aby nie stosować limitu. Dotyczy tylko użytkowników z rolą Klient.
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={handleSaveLimits} loading={savingLimits}>
                <Save className="w-4 h-4" />
                Zapisz
              </Button>
            </div>
          </Card>
        )}

        {/* ── TAB: Wygląd ─────────────────────────────────────────────────── */}
        {activeTab === 'appearance' && (
          <div className="space-y-5 max-w-2xl">
            {/* Logo & Favicon */}
            <Card>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                  <Image className="w-4.5 h-4.5 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Logo i Favicon</p>
                  <p className="text-xs text-[var(--text-muted)]">Personalizacja brandingu panelu</p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Logo URL */}
                <div>
                  <Input
                    label="Logo URL"
                    placeholder="https://example.com/logo.png"
                    value={appearance.panel_logo_url}
                    onChange={(e) => setAppearance((a) => ({ ...a, panel_logo_url: e.target.value }))}
                    icon={<Image className="w-4 h-4" />}
                  />
                  {appearance.panel_logo_url && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] inline-flex">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={appearance.panel_logo_url}
                        alt="Logo preview"
                        className="h-12 rounded-lg object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* Favicon URL */}
                <div>
                  <Input
                    label="Favicon URL"
                    placeholder="https://example.com/favicon.ico"
                    value={appearance.panel_favicon_url}
                    onChange={(e) => setAppearance((a) => ({ ...a, panel_favicon_url: e.target.value }))}
                    icon={<Image className="w-4 h-4" />}
                  />
                  {appearance.panel_favicon_url && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] inline-flex">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={appearance.panel_favicon_url}
                        alt="Favicon preview"
                        className="h-12 rounded-lg object-contain"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={handleSaveAppearance} loading={savingAppearance}>
                  <Save className="w-4 h-4" />
                  Zapisz
                </Button>
              </div>
            </Card>

            {/* Global Cloudflare Token */}
            <Card>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                  <Cloud className="w-4.5 h-4.5 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Globalny token Cloudflare</p>
                  <p className="text-xs text-[var(--text-muted)]">Token używany gdy użytkownik nie ma własnego tokenu CF</p>
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  label="CF Global Token"
                  type="password"
                  placeholder="••••••••  (pozostaw puste, aby nie zmieniać)"
                  value={cfToken.cf_global_token}
                  onChange={(e) => setCfToken({ cf_global_token: e.target.value })}
                  icon={<Key className="w-4 h-4" />}
                />
              </div>

              <div className="mt-4 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-[var(--text-muted)]">
                Token używany gdy użytkownik nie ma własnego tokenu CF. Wymaga uprawnień DNS:Edit dla wszystkich stref.
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={handleSaveCfToken} loading={savingCfToken}>
                  <Save className="w-4 h-4" />
                  Zapisz
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* ── TAB: Integracje ──────────────────────────────────────────────── */}
        {activeTab === 'integrations' && (
          <div className="space-y-5 max-w-2xl">
            <Card>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <HardDrive className="w-4.5 h-4.5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">S3 / Backblaze B2</p>
                  <p className="text-xs text-[var(--text-muted)]">Przechowywanie backupów w chmurze</p>
                </div>
              </div>

              {/* Warning */}
              <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">
                  Konfiguracja S3 jest wymagana do przechowywania backupów w chmurze
                </p>
              </div>

              <div className="space-y-4">
                <Input
                  label="Endpoint URL"
                  placeholder="https://s3.us-west-002.backblazeb2.com"
                  value={s3.s3_endpoint}
                  onChange={(e) => setS3((s) => ({ ...s, s3_endpoint: e.target.value }))}
                  icon={<Globe className="w-4 h-4" />}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Bucket"
                    placeholder="my-backups"
                    value={s3.s3_bucket}
                    onChange={(e) => setS3((s) => ({ ...s, s3_bucket: e.target.value }))}
                    icon={<HardDrive className="w-4 h-4" />}
                  />
                  <Input
                    label="Region"
                    placeholder="us-west-002"
                    value={s3.s3_region}
                    onChange={(e) => setS3((s) => ({ ...s, s3_region: e.target.value }))}
                  />
                </div>

                <Input
                  label="Access Key ID"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={s3.s3_access_key}
                  onChange={(e) => setS3((s) => ({ ...s, s3_access_key: e.target.value }))}
                  icon={<Key className="w-4 h-4" />}
                />

                <Input
                  label="Secret Access Key"
                  type="password"
                  placeholder="••••••••  (pozostaw puste, aby nie zmieniać)"
                  value={s3.s3_secret_key}
                  onChange={(e) => setS3((s) => ({ ...s, s3_secret_key: e.target.value }))}
                  icon={<Lock className="w-4 h-4" />}
                />
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={handleSaveS3} loading={savingS3}>
                  <Save className="w-4 h-4" />
                  Zapisz
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* ── TAB: Audit Log ──────────────────────────────────────────────── */}
        {activeTab === 'audit' && (
          <Card className="p-0 overflow-hidden">
            {/* Card header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Logi audytu</p>
                <p className="text-xs text-[var(--text-muted)]">Ostatnie 100 zdarzeń — odświeżanie co 30 s</p>
              </div>
              <Button variant="secondary" size="sm" onClick={refetchAudit}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* Table header */}
            <div className="hidden md:flex items-center gap-4 px-5 py-2.5 border-b border-white/[0.04] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
              <span className="w-36">Data</span>
              <span className="w-40">Użytkownik</span>
              <span className="w-44">Akcja</span>
              <span className="flex-1">Zasób</span>
              <span className="w-28">IP</span>
            </div>

            {/* Loading */}
            {auditLoading && (
              <div className="py-12 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Empty */}
            {!auditLoading && (!auditData || auditData.length === 0) && (
              <div className="py-12 flex flex-col items-center gap-3 text-[var(--text-muted)]">
                <FileText className="w-10 h-10 opacity-20" />
                <p className="text-sm">Brak wpisów w logu audytu</p>
              </div>
            )}

            {/* Rows */}
            {!auditLoading &&
              auditData &&
              auditData.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-4 px-5 py-3 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  {/* Date */}
                  <div className="w-36 text-xs text-[var(--text-muted)] font-mono flex-shrink-0">
                    {formatDate(entry.createdAt)}
                  </div>

                  {/* User */}
                  <div className="w-40 min-w-0 flex-shrink-0">
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {entry.user.name}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] truncate">{entry.user.email}</p>
                  </div>

                  {/* Action badge */}
                  <div className="w-44 flex-shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium ${getActionBadgeClass(
                        entry.action
                      )}`}
                    >
                      {getActionIcon(entry.action)}
                      {entry.action}
                    </span>
                  </div>

                  {/* Resource */}
                  <div className="flex-1 min-w-0">
                    {entry.resource || entry.resourceId ? (
                      <p className="text-xs text-[var(--text-secondary)] truncate font-mono">
                        {[entry.resource, entry.resourceId].filter(Boolean).join(' · ')}
                      </p>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    )}
                  </div>

                  {/* IP */}
                  <div className="w-28 flex-shrink-0">
                    {entry.ip ? (
                      <span className="text-xs text-[var(--text-muted)] font-mono">{entry.ip}</span>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    )}
                  </div>
                </div>
              ))}
          </Card>
        )}
      </div>
    </div>
  )
}
