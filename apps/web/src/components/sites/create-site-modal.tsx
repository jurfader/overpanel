'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { Globe, Lock, ArrowLeft, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

// ── Site types ─────────────────────────────────────────────────────────────────

type SiteType = 'wordpress' | 'php' | 'nodejs' | 'static' | 'python' | 'proxy' | 'overcms' | 'overcms2' | 'openclaw'

interface SiteTypeOption {
  id: SiteType
  label: string
  description: string
  available: boolean
  icon: React.ReactNode
  accent: string
}

const SITE_TYPES: SiteTypeOption[] = [
  {
    id: 'wordpress',
    label: 'WordPress',
    description: 'Automatyczna instalacja przez WP-CLI',
    available: true,
    accent: '#21759b',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-10 h-10">
        <circle cx="16" cy="16" r="14" fill="#21759b" opacity="0.15" />
        <circle cx="16" cy="16" r="14" stroke="#21759b" strokeWidth="1.5" opacity="0.4" />
        <text x="16" y="21" textAnchor="middle" fill="#21759b" fontSize="14" fontWeight="800" fontFamily="Georgia, serif">W</text>
      </svg>
    ),
  },
  {
    id: 'php',
    label: 'PHP',
    description: 'Nginx + PHP-FPM, dowolna wersja',
    available: true,
    accent: '#8892bf',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-10 h-10">
        <rect x="2" y="11" width="28" height="10" rx="5" fill="#8892bf" fillOpacity="0.15" stroke="#8892bf" strokeOpacity="0.4" strokeWidth="1.5" />
        <text x="16" y="20" textAnchor="middle" fill="#8892bf" fontSize="9" fontWeight="700" fontFamily="monospace">PHP</text>
      </svg>
    ),
  },
  {
    id: 'nodejs',
    label: 'Node.js',
    description: 'PM2 + Nginx reverse proxy',
    available: true,
    accent: '#68a063',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-10 h-10">
        <polygon points="16,3 29,10 29,22 16,29 3,22 3,10" fill="#68a063" fillOpacity="0.12" stroke="#68a063" strokeOpacity="0.35" strokeWidth="1.5" />
        <text x="16" y="21" textAnchor="middle" fill="#68a063" fontSize="7" fontWeight="700" fontFamily="monospace">NODE</text>
      </svg>
    ),
  },
  {
    id: 'static',
    label: 'HTML / Static',
    description: 'Nginx bez serwera aplikacji',
    available: true,
    accent: '#e44d26',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-10 h-10">
        <rect x="5" y="4" width="22" height="24" rx="3" fill="#e44d26" fillOpacity="0.12" stroke="#e44d26" strokeOpacity="0.35" strokeWidth="1.5" />
        <text x="16" y="21" textAnchor="middle" fill="#e44d26" fontSize="8.5" fontWeight="700" fontFamily="monospace">HTML</text>
      </svg>
    ),
  },
  {
    id: 'overcms',
    label: 'OverCMS',
    description: 'Własny CMS — Docker Compose + PostgreSQL',
    available: true,
    accent: '#E91E8C',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-10 h-10">
        <circle cx="16" cy="16" r="14" fill="#E91E8C" opacity="0.15" />
        <circle cx="16" cy="16" r="14" stroke="#E91E8C" strokeWidth="1.5" opacity="0.4" />
        <text x="16" y="21" textAnchor="middle" fill="#E91E8C" fontSize="8" fontWeight="800" fontFamily="monospace">CMS</text>
      </svg>
    ),
  },
  {
    id: 'overcms2',
    label: 'OverCMS 2.0',
    description: 'WordPress + React panel — natywny LAMP',
    available: true,
    accent: '#E91E8C',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-10 h-10">
        <defs>
          <linearGradient id="overcms2-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#E91E8C" />
            <stop offset="1" stopColor="#9333EA" />
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="26" height="26" rx="6" fill="url(#overcms2-grad)" fillOpacity="0.15" stroke="url(#overcms2-grad)" strokeWidth="1.5" strokeOpacity="0.6" />
        <text x="16" y="20" textAnchor="middle" fill="#E91E8C" fontSize="8" fontWeight="800" fontFamily="system-ui">2.0</text>
      </svg>
    ),
  },
  {
    id: 'openclaw',
    label: 'OpenClaw AI',
    description: 'Asystent AI — Docker + WebSocket gateway',
    available: true,
    accent: '#10B981',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-10 h-10">
        <circle cx="16" cy="16" r="14" fill="#10B981" opacity="0.15" />
        <circle cx="16" cy="16" r="14" stroke="#10B981" strokeWidth="1.5" opacity="0.4" />
        <text x="16" y="21" textAnchor="middle" fill="#10B981" fontSize="7" fontWeight="800" fontFamily="monospace">AI</text>
      </svg>
    ),
  },
  {
    id: 'python',
    label: 'Python',
    description: 'Gunicorn / uWSGI + Nginx proxy',
    available: false,
    accent: '#fbbf24',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-10 h-10">
        <circle cx="16" cy="16" r="13" fill="#fbbf24" fillOpacity="0.12" stroke="#fbbf24" strokeOpacity="0.35" strokeWidth="1.5" />
        <text x="16" y="20" textAnchor="middle" fill="#fbbf24" fontSize="9" fontWeight="700" fontFamily="monospace">PY</text>
      </svg>
    ),
  },
  {
    id: 'proxy',
    label: 'Reverse Proxy',
    description: 'Przekierowanie do innego serwisu',
    available: false,
    accent: '#9B26D9',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-10 h-10">
        <rect x="3" y="11" width="10" height="10" rx="2.5" fill="#9B26D9" fillOpacity="0.15" stroke="#9B26D9" strokeOpacity="0.4" strokeWidth="1.5" />
        <rect x="19" y="11" width="10" height="10" rx="2.5" fill="#9B26D9" fillOpacity="0.15" stroke="#9B26D9" strokeOpacity="0.4" strokeWidth="1.5" />
        <path d="M13 16h6M17 13l2 3-2 3" stroke="#9B26D9" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

// ── Props ──────────────────────────────────────────────────────────────────────

interface CreateSiteModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CreateSiteModal({ open, onClose, onSuccess }: CreateSiteModalProps) {
  const [step, setStep] = useState<'type' | 'config' | 'installing'>('type')
  const [siteType, setSiteType] = useState<SiteType | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [domain, setDomain] = useState('')
  const [phpVersion, setPhpVersion] = useState('8.3')
  const [enableSsl, setEnableSsl] = useState(true)

  // Node.js-specific
  const [appPort, setAppPort] = useState('3000')
  const [startCommand, setStartCommand] = useState('server.js')

  // WP-specific
  const [wpTitle, setWpTitle] = useState('')
  const [wpAdmin, setWpAdmin] = useState('')
  const [wpEmail, setWpEmail] = useState('')
  const [wpPassword, setWpPassword] = useState('')
  const [wpLocale, setWpLocale] = useState('pl_PL')
  const [wpDbEngine, setWpDbEngine] = useState<'mysql' | 'postgresql'>('mysql')

  // OverCMS-specific
  const [cmsLicenseKey, setCmsLicenseKey] = useState('')
  const [cmsAdminEmail, setCmsAdminEmail] = useState('')
  const [cmsAdminPassword, setCmsAdminPassword] = useState('')

  // OverCMS 2.0-specific
  const [cms2AdminUser, setCms2AdminUser] = useState('admin')
  const [cms2AdminEmail, setCms2AdminEmail] = useState('')
  const [cms2AdminPassword, setCms2AdminPassword] = useState('')
  const [cms2SiteTitle, setCms2SiteTitle] = useState('')
  const [cms2LicenseKey, setCms2LicenseKey] = useState('')

  // OpenClaw-specific
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [telegramToken, setTelegramToken] = useState('')
  const [discordToken, setDiscordToken] = useState('')

  // Install progress (OverCMS)
  const [installLog, setInstallLog] = useState<string[]>([])
  const [installStatus, setInstallStatus] = useState<'running' | 'success' | 'failed'>('running')
  const [installStep, setInstallStep] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [installLog])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // ESC key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'installing') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, step])

  if (!open) return null

  function startPolling(targetDomain: string) {
    setStep('installing')
    setInstallLog(['Rozpoczynanie instalacji OverCMS...'])
    setInstallStatus('running')
    setInstallStep('')

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<{ status: string; step: string; log: string[] } | null>(`/api/sites/install-status/${targetDomain}`)
        if (res) {
          setInstallLog(res.log)
          setInstallStep(res.step)
          if (res.status === 'success' || res.status === 'failed') {
            setInstallStatus(res.status as 'success' | 'failed')
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            if (res.status === 'success') {
              onSuccess()
            }
          }
        }
      } catch {
        // API might be temporarily unreachable
      }
    }, 2000)
  }

  const handleClose = () => {
    if (step === 'installing' && installStatus === 'running') return // can't close during install
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    onClose()
    setTimeout(() => {
      setStep('type')
      setSiteType(null)
      setError('')
      setDomain('')
      setAppPort('3000')
      setStartCommand('server.js')
      setWpTitle('')
      setWpAdmin('')
      setWpEmail('')
      setWpPassword('')
      setCms2AdminUser('admin')
      setCms2AdminEmail('')
      setCms2AdminPassword('')
      setCms2SiteTitle('')
      setCms2LicenseKey('')
      setInstallLog([])
      setInstallStatus('running')
      setInstallStep('')
    }, 300)
  }

  const handleSelectType = (type: SiteTypeOption) => {
    if (!type.available) return
    setSiteType(type.id)
    setStep('config')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (siteType === 'wordpress') {
        // 1. Create site
        const site = await api.post<{ id: string }>('/api/sites', {
          domain,
          phpVersion: '8.3',
          enableSsl: true,
        })
        const siteId = site.id

        // 2. Queue WP install (async on server)
        await api.post('/api/wordpress/install', {
          siteId,
          dbEngine: wpDbEngine,
          dbAutoCreate: true,
          dbName: domain.replace(/\./g, '_').replace(/-/g, '_').slice(0, 60),
          siteTitle: wpTitle,
          adminUser: wpAdmin,
          adminPassword: wpPassword,
          adminEmail: wpEmail,
          locale: wpLocale,
        })
      } else if (siteType === 'overcms') {
        await api.post('/api/sites', {
          domain,
          siteType: 'overcms',
          enableSsl,
          adminEmail: cmsAdminEmail,
          adminPassword: cmsAdminPassword,
          licenseKey: cmsLicenseKey || undefined,
        })
        // Start polling for install progress — don't close modal
        setLoading(false)
        startPolling(domain)
        return
      } else if (siteType === 'overcms2') {
        await api.post('/api/sites', {
          domain,
          siteType: 'overcms2',
          enableSsl,
          phpVersion: '8.3',
          adminUser: cms2AdminUser,
          adminEmail: cms2AdminEmail,
          adminPassword: cms2AdminPassword,
          siteTitle: cms2SiteTitle || undefined,
          licenseKey: cms2LicenseKey || undefined,
        })
        setLoading(false)
        startPolling(domain)
        return
      } else if (siteType === 'openclaw') {
        await api.post('/api/sites', {
          domain,
          siteType: 'openclaw',
          enableSsl,
          openaiApiKey: openaiKey || undefined,
          anthropicApiKey: anthropicKey || undefined,
          telegramToken: telegramToken || undefined,
          discordToken: discordToken || undefined,
        })
        setLoading(false)
        startPolling(domain)
        return
      } else if (siteType === 'nodejs') {
        await api.post('/api/sites', {
          domain,
          siteType: 'nodejs',
          appPort: parseInt(appPort, 10) || 3000,
          startCommand: startCommand || 'server.js',
          enableSsl,
        })
      } else {
        // php, static, python, proxy
        await api.post('/api/sites', {
          domain,
          siteType: siteType ?? 'php',
          phpVersion: (siteType === 'static' || siteType === 'python' || siteType === 'proxy') ? '8.3' : phpVersion,
          enableSsl,
        })
      }

      onSuccess()
      handleClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas tworzenia strony')
    } finally {
      setLoading(false)
    }
  }

  const isWordPress = siteType === 'wordpress'
  const isOverCms = siteType === 'overcms'
  const isOverCms2 = siteType === 'overcms2'
  const isOpenClaw = siteType === 'openclaw'
  const isStatic = siteType === 'static'
  const isNodeJs = siteType === 'nodejs'
  const isPhpBased = siteType === 'php' || siteType === 'wordpress'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div
        className="relative glass-card rounded-2xl border border-white/10 shadow-2xl w-full flex flex-col transition-all duration-300"
        style={{ maxWidth: step === 'type' ? '680px' : step === 'installing' ? '600px' : '480px', maxHeight: 'calc(100vh - 2rem)' }}
      >
        {/* Header — sticky */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            {step === 'config' && (
              <button
                onClick={() => { setStep('type'); setError('') }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {step === 'type'
                  ? 'Nowa strona WWW'
                  : step === 'installing'
                    ? `Instalacja ${SITE_TYPES.find(t => t.id === siteType)?.label ?? ''}`
                    : `Strona ${SITE_TYPES.find(t => t.id === siteType)?.label}`}
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {step === 'type' ? 'Wybierz typ środowiska' : step === 'installing' ? domain : 'Skonfiguruj domenę i parametry'}
              </p>
            </div>
          </div>
          {step !== 'installing' || installStatus !== 'running' ? (
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'installing' ? (
            // ── STEP 3: Install progress ────────────────────────────────────────
            <div className="space-y-4">
              {/* Status header */}
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${installStatus === 'running' ? 'bg-amber-400 animate-pulse' : installStatus === 'success' ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  {installStatus === 'running' ? installStep || 'Uruchamianie...' : installStatus === 'success' ? 'Instalacja zakończona' : 'Instalacja nieudana'}
                </span>
                {installStatus === 'running' && <Loader2 className="w-4 h-4 text-amber-400 animate-spin ml-auto" />}
              </div>

              {/* Terminal log */}
              <div
                className="h-80 overflow-y-auto rounded-xl p-4 font-mono text-xs leading-relaxed border border-white/[0.06]"
                style={{ backgroundColor: '#0a0a0f' }}
              >
                {installLog.map((line, i) => (
                  <div
                    key={i}
                    className={`whitespace-pre-wrap break-all ${
                      line.startsWith('✓') ? 'text-green-400' :
                      line.startsWith('✗') ? 'text-red-400' :
                      line.startsWith('>') ? 'text-amber-400' :
                      'text-[var(--text-muted)]'
                    }`}
                  >
                    {line}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>

              {/* Result banners */}
              {installStatus === 'success' && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-400">
                      {SITE_TYPES.find(t => t.id === siteType)?.label ?? 'Instalacja'} zakończona pomyślnie!
                    </p>
                    <p className="text-xs text-green-400/70 mt-0.5">
                      {siteType === 'overcms2'
                        ? <>Panel admina: <code className="text-green-300">https://{domain}/wp/wp-admin/</code></>
                        : <>Adres: <code className="text-green-300">https://{domain}</code></>}
                    </p>
                  </div>
                </div>
              )}
              {installStatus === 'failed' && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Instalacja nie powiodła się.</p>
                    <p className="text-xs text-red-400/70 mt-0.5">Sprawdź logi powyżej, aby poznać przyczynę błędu.</p>
                  </div>
                </div>
              )}

              {/* Close button (only when done) */}
              {installStatus !== 'running' && (
                <div className="flex justify-end pt-1">
                  <Button onClick={handleClose}>
                    Zamknij
                  </Button>
                </div>
              )}
            </div>
          ) : step === 'type' ? (
            // ── STEP 1: Type picker ────────────────────────────────────────────
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SITE_TYPES.map((type) => (
                <TypeCard key={type.id} type={type} onSelect={handleSelectType} />
              ))}
            </div>
          ) : (
            // ── STEP 2: Config form ────────────────────────────────────────────
            <>
              {error && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Domain */}
                <Input
                  label="Domena"
                  placeholder="example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value.toLowerCase().trim())}
                  icon={<Globe className="w-4 h-4" />}
                  required
                />

                {/* PHP version — only for PHP type */}
                {isPhpBased && !isWordPress && (
                  <Select
                    label="Wersja PHP"
                    value={phpVersion}
                    onChange={(e) => setPhpVersion(e.target.value)}
                  >
                    <option value="8.3">PHP 8.3 (zalecane)</option>
                    <option value="8.2">PHP 8.2</option>
                    <option value="8.1">PHP 8.1</option>
                    <option value="8.0">PHP 8.0</option>
                    <option value="7.4">PHP 7.4 (legacy)</option>
                  </Select>
                )}

                {/* Node.js fields */}
                {isNodeJs && (
                  <div className="space-y-3">
                    <div className="border-t border-white/[0.06] pt-4">
                      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Aplikacja Node.js</p>
                      <div className="space-y-3">
                        <FieldInput
                          label="Port aplikacji"
                          value={appPort}
                          onChange={setAppPort}
                          placeholder="3000"
                          type="number"
                          hint="Port, na którym nasłuchuje Twoja aplikacja (np. 3000)"
                        />
                        <FieldInput
                          label="Plik startowy"
                          value={startCommand}
                          onChange={setStartCommand}
                          placeholder="server.js"
                          hint="Plik wejściowy uruchamiany przez PM2 (np. index.js, dist/server.js)"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* WordPress fields */}
                {isWordPress && (
                  <>
                    <div className="border-t border-white/[0.06] pt-4">
                      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Baza danych</p>
                      <Select
                        label="Silnik bazy danych"
                        value={wpDbEngine}
                        onChange={(e) => setWpDbEngine(e.target.value as 'mysql' | 'postgresql')}
                      >
                        <option value="mysql">MySQL (zalecane dla WP)</option>
                        <option value="postgresql">PostgreSQL</option>
                      </Select>
                    </div>

                    <div className="border-t border-white/[0.06] pt-4">
                      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">WordPress</p>
                      <div className="space-y-3">
                        <FieldInput
                          label="Tytuł strony"
                          value={wpTitle}
                          onChange={setWpTitle}
                          placeholder="Moja strona"
                          required
                        />
                        <Select
                          label="Język"
                          value={wpLocale}
                          onChange={(e) => setWpLocale(e.target.value)}
                        >
                          <option value="pl_PL">Polski</option>
                          <option value="en_US">English (US)</option>
                          <option value="de_DE">Deutsch</option>
                          <option value="fr_FR">Français</option>
                          <option value="es_ES">Español</option>
                        </Select>
                      </div>
                    </div>

                    <div className="border-t border-white/[0.06] pt-4">
                      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Konto admina WP</p>
                      <div className="space-y-3">
                        <FieldInput label="Nazwa użytkownika" value={wpAdmin} onChange={setWpAdmin} placeholder="admin" required />
                        <FieldInput label="E-mail" value={wpEmail} onChange={setWpEmail} placeholder="admin@example.com" type="email" required />
                        <FieldInput label="Hasło" value={wpPassword} onChange={setWpPassword} placeholder="min. 8 znaków" type="password" required />
                      </div>
                    </div>
                  </>
                )}

                {/* OverCMS fields */}
                {isOverCms && (
                  <>
                    <div className="pt-2 border-t border-white/[0.06]">
                      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">OverCMS</p>
                      <div className="space-y-3">
                        <Input
                          label="E-mail administratora"
                          placeholder="admin@example.com"
                          value={cmsAdminEmail}
                          onChange={(e) => setCmsAdminEmail(e.target.value)}
                          required
                        />
                        <Input
                          label="Hasło administratora"
                          type="password"
                          placeholder="Min. 8 znaków"
                          value={cmsAdminPassword}
                          onChange={(e) => setCmsAdminPassword(e.target.value)}
                          required
                        />
                        <Input
                          label="Klucz licencyjny"
                          placeholder="XXXX-XXXX-XXXX-XXXX"
                          value={cmsLicenseKey}
                          onChange={(e) => setCmsLicenseKey(e.target.value)}
                          required
                        />
                        <p className="text-[10px] text-[var(--text-muted)]">
                          Klucz licencyjny jest wymagany do instalacji OverCMS.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* OverCMS 2.0 fields */}
                {isOverCms2 && (
                  <>
                    <div className="pt-2 border-t border-white/[0.06]">
                      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">OverCMS 2.0 (WordPress + React)</p>
                      <div className="space-y-3">
                        <FieldInput
                          label="Tytuł strony"
                          value={cms2SiteTitle}
                          onChange={setCms2SiteTitle}
                          placeholder="Moja strona OverCMS"
                          hint="Domyślnie: OverCMS — można zmienić później w panelu"
                        />
                        <FieldInput
                          label="Login administratora"
                          value={cms2AdminUser}
                          onChange={setCms2AdminUser}
                          placeholder="admin"
                          required
                        />
                        <FieldInput
                          label="E-mail administratora"
                          value={cms2AdminEmail}
                          onChange={setCms2AdminEmail}
                          placeholder="admin@example.com"
                          type="email"
                          required
                        />
                        <FieldInput
                          label="Hasło administratora"
                          value={cms2AdminPassword}
                          onChange={setCms2AdminPassword}
                          placeholder="Min. 8 znaków"
                          type="password"
                          required
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/[0.06]">
                      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Licencja OverCMS (opcjonalnie)</p>
                      <div className="space-y-3">
                        <FieldInput
                          label="Klucz licencyjny"
                          value={cms2LicenseKey}
                          onChange={setCms2LicenseKey}
                          placeholder="XXXX-XXXX-XXXX-XXXX"
                          hint="Z kluczem licencyjnym instalator automatycznie pobierze i aktywuje motyw Divi z serwera licencji."
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-[var(--text-muted)]">
                      Instalator pobierze najnowszy release z GitHub, utworzy bazę MySQL, skonfiguruje WordPress (Bedrock) i włączy panel React pod adresem <code className="text-[var(--text-secondary)]">/wp/wp-admin/</code>.
                    </p>
                  </>
                )}

                {/* OpenClaw fields */}
                {isOpenClaw && (
                  <>
                    <div className="pt-2 border-t border-white/[0.06]">
                      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">OpenClaw AI</p>
                      <div className="space-y-3">
                        <FieldInput
                          label="Klucz API OpenAI"
                          value={openaiKey}
                          onChange={setOpenaiKey}
                          placeholder="sk-..."
                          type="password"
                          hint="Opcjonalny jeśli podasz klucz Anthropic"
                        />
                        <FieldInput
                          label="Klucz API Anthropic"
                          value={anthropicKey}
                          onChange={setAnthropicKey}
                          placeholder="sk-ant-..."
                          type="password"
                          hint="Opcjonalny jeśli podasz klucz OpenAI"
                        />
                      </div>
                    </div>
                    <div className="pt-2 border-t border-white/[0.06]">
                      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Kanały (opcjonalne)</p>
                      <div className="space-y-3">
                        <FieldInput
                          label="Telegram Bot Token"
                          value={telegramToken}
                          onChange={setTelegramToken}
                          placeholder="123456:ABC-..."
                          type="password"
                        />
                        <FieldInput
                          label="Discord Bot Token"
                          value={discordToken}
                          onChange={setDiscordToken}
                          placeholder="MTk..."
                          type="password"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      Wymagany jest co najmniej jeden klucz API (OpenAI lub Anthropic). Kanały komunikacji można skonfigurować później.
                    </p>
                  </>
                )}

                {/* SSL toggle — not for WP (always on) */}
                {!isWordPress && !isOverCms && !isOverCms2 && !isOpenClaw && (
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <Lock className="w-4 h-4 text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">Certyfikat SSL</p>
                        <p className="text-xs text-[var(--text-muted)]">Automatyczny (Let's Encrypt / Cloudflare)</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnableSsl((v) => !v)}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                        enableSsl ? 'bg-[var(--primary)]' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                          enableSsl ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                )}

                {/* Summary */}
                <div className="p-4 rounded-xl gradient-subtle border border-[var(--primary)]/15 text-xs text-[var(--text-muted)] space-y-1">
                  <p className="font-medium text-[var(--text-secondary)]">Co zostanie utworzone automatycznie:</p>
                  <p>• Katalog <code className="text-[var(--primary)]">/var/www/{domain || 'twoja-domena.pl'}/public</code></p>
                  {isNodeJs
                    ? <p>• Nginx reverse proxy → port {appPort || '3000'}</p>
                    : <p>• Konfiguracja Nginx{isPhpBased ? ` + PHP ${phpVersion}-FPM` : ''}</p>
                  }
                  {isNodeJs && <p>• PM2 process manager (uruchom aplikację ręcznie po wgraniu plików)</p>}
                  {isWordPress && <p>• Baza danych {wpDbEngine === 'mysql' ? 'MySQL' : 'PostgreSQL'}</p>}
                  {isWordPress && <p>• WordPress (instalacja WP-CLI)</p>}
                  {!isWordPress && enableSsl && <p>• Certyfikat SSL</p>}
                  <p>• Użytkownik systemowy (izolacja)</p>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
                    Anuluj
                  </Button>
                  <Button type="submit" className="flex-1" loading={loading}>
                    {!loading && (isWordPress ? 'Utwórz i zainstaluj WP' : 'Utwórz stronę')}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── TypeCard ───────────────────────────────────────────────────────────────────

function TypeCard({ type, onSelect }: { type: SiteTypeOption; onSelect: (t: SiteTypeOption) => void }) {
  const unavailable = !type.available

  return (
    <button
      onClick={() => onSelect(type)}
      disabled={unavailable}
      className={`group relative flex flex-col items-center gap-3 p-5 rounded-2xl border text-center transition-all duration-200 ${
        unavailable
          ? 'border-white/[0.04] bg-white/[0.02] opacity-50 cursor-not-allowed'
          : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.15] hover:scale-[1.02] cursor-pointer'
      }`}
    >
      {/* Glow on hover */}
      {!unavailable && (
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ boxShadow: `inset 0 0 30px ${type.accent}18` }}
        />
      )}

      {/* Coming soon badge */}
      {unavailable && (
        <span className="absolute top-2 right-2 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/10 text-[var(--text-muted)]">
          Wkrótce
        </span>
      )}

      {/* Icon */}
      <div className="flex-shrink-0">
        {type.icon}
      </div>

      {/* Label */}
      <div>
        <p className={`text-sm font-semibold transition-colors ${
          unavailable ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)] group-hover:text-white'
        }`}>
          {type.label}
        </p>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-tight">
          {type.description}
        </p>
      </div>

      {/* Arrow on hover */}
      {!unavailable && (
        <div
          className="absolute bottom-3 right-3 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-75 group-hover:scale-100"
          style={{ background: `${type.accent}30`, color: type.accent }}
        >
          <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
            <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  )
}

// ── Simple input helper ────────────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
      />
      {hint && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}
