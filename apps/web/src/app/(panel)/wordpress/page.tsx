'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import type { Site, Database } from '@overpanel/shared'
import {
  Box,
  Plus,
  RefreshCw,
  Trash2,
  ArrowUpCircle,
  Globe,
  Database as DbIcon,
  CheckCircle2,
  AlertCircle,
  X,
  Palette,
} from 'lucide-react'

type WpSite = Pick<Site, 'id' | 'domain' | 'documentRoot' | 'status' | 'hasWordpress' | 'wpVersion' | 'createdAt'> & {
  user?: { id: string; name: string; email: string }
}

const LOCALES = [
  { value: 'pl_PL', label: 'Polski' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'de_DE', label: 'Deutsch' },
  { value: 'fr_FR', label: 'Français' },
  { value: 'es_ES', label: 'Español' },
]

const STARTER_THEMES = [
  { slug: 'none', name: 'Brak (domyślny WordPress)' },
  { slug: 'astra', name: 'Astra' },
  { slug: 'hello-elementor', name: 'Hello Elementor' },
  { slug: 'generatepress', name: 'GeneratePress' },
  { slug: 'oceanwp', name: 'OceanWP' },
  { slug: 'neve', name: 'Neve' },
  { slug: 'kadence', name: 'Kadence' },
  { slug: 'blocksy', name: 'Blocksy' },
  { slug: 'storefront', name: 'Storefront (WooCommerce)' },
]

export default function WordPressPage() {
  const user = useAuthStore((s) => s.user)
  const { data: wpSites, loading, error, refetch } = useApi<WpSite[]>('/api/wordpress')
  const { data: allSites } = useApi<Site[]>('/api/sites')
  const { data: allDbs } = useApi<Database[]>('/api/databases')
  const [showInstall, setShowInstall] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [themeModal, setThemeModal] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const sites = wpSites ?? []
  const availableSites = (allSites ?? []).filter((s) => !s.hasWordpress && s.status === 'active')
  const databases = allDbs ?? []

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const handleInstall = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload = {
      siteId: fd.get('siteId'),
      databaseId: fd.get('databaseId'),
      siteTitle: fd.get('siteTitle'),
      adminUser: fd.get('adminUser'),
      adminPassword: fd.get('adminPassword'),
      adminEmail: fd.get('adminEmail'),
      locale: fd.get('locale'),
      starterTheme: fd.get('starterTheme'),
    }

    setInstalling(true)
    try {
      await api.post('/api/wordpress/install', payload)
      setShowInstall(false)
      showToast('success', 'Instalacja WordPressa uruchomiona — może potrwać kilka minut.')
      setTimeout(refetch, 5000)
    } catch (err: any) {
      showToast('error', err.message ?? 'Błąd instalacji')
    } finally {
      setInstalling(false)
    }
  }

  const handleUpdate = async (siteId: string, domain: string) => {
    if (!confirm(`Zaktualizować WordPress na ${domain}?`)) return
    setUpdating(siteId)
    try {
      await api.post(`/api/wordpress/${siteId}/update`)
      showToast('success', 'Aktualizacja uruchomiona.')
      setTimeout(refetch, 8000)
    } catch {
      showToast('error', 'Błąd aktualizacji')
    } finally {
      setUpdating(null)
    }
  }

  const handleUninstall = async (siteId: string, domain: string) => {
    if (!confirm(`Usunąć WordPress z ${domain}? Pliki WP zostaną usunięte, baza pozostanie.`)) return
    try {
      await api.delete(`/api/wordpress/${siteId}`)
      showToast('success', 'WordPress usunięty.')
      refetch()
    } catch {
      showToast('error', 'Błąd podczas usuwania')
    }
  }

  return (
    <div className="min-h-screen">
      <Topbar title="WordPress" subtitle={`${sites.length} instalacji`} />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-green-500/20 border border-green-500/30 text-green-300'
            : 'bg-red-500/20 border border-red-500/30 text-red-300'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
          <button onClick={() => setToast(null)}><X className="w-3 h-3 opacity-60 hover:opacity-100" /></button>
        </div>
      )}

      <div className="p-6 space-y-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          <Button size="sm" onClick={() => setShowInstall(true)} disabled={availableSites.length === 0}>
            <Plus className="w-4 h-4" />
            Zainstaluj WordPress
          </Button>
        </div>

        {/* Instalacje */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.06] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            <span className="flex-1">Domena</span>
            <span className="hidden md:block w-28">Wersja WP</span>
            {user?.role === 'admin' && <span className="hidden lg:block w-32">Użytkownik</span>}
            <span className="w-28 text-right">Akcje</span>
          </div>

          {loading && (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <div className="py-8 text-center text-sm text-red-400">{error}</div>}
          {!loading && !error && sites.length === 0 && (
            <EmptyState
              icon={Box}
              title="Brak instalacji WordPress"
              description="Zainstaluj WordPress jednym kliknięciem na wybranej stronie"
              action={availableSites.length > 0 ? { label: 'Zainstaluj WordPress', onClick: () => setShowInstall(true) } : undefined}
            />
          )}
          {!loading && sites.map((site) => (
            <div key={site.id} className="flex items-center gap-4 px-4 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
              {/* Domain */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#21759b]/20 flex items-center justify-center flex-shrink-0">
                    <Box className="w-3.5 h-3.5 text-[#21759b]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{site.domain}</p>
                    <a
                      href={`https://${site.domain}/wp-admin`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                    >
                      wp-admin ↗
                    </a>
                  </div>
                </div>
              </div>

              {/* Version */}
              <div className="hidden md:block w-28">
                <Badge variant={site.wpVersion ? 'default' : 'secondary'}>
                  {site.wpVersion ?? 'nieznana'}
                </Badge>
              </div>

              {/* User (admin only) */}
              {user?.role === 'admin' && (
                <div className="hidden lg:block w-32 text-xs text-[var(--text-muted)] truncate">
                  {site.user?.name ?? '-'}
                </div>
              )}

              {/* Actions */}
              <div className="w-28 flex items-center justify-end gap-1.5">
                <button
                  onClick={() => handleUpdate(site.id, site.domain)}
                  disabled={updating === site.id}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-blue-400 hover:bg-blue-400/10 transition-all disabled:opacity-50"
                  title="Aktualizuj WordPress"
                >
                  {updating === site.id
                    ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    : <ArrowUpCircle className="w-4 h-4" />
                  }
                </button>
                <a
                  href={`https://${site.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-green-400 hover:bg-green-400/10 transition-all"
                  title="Otwórz stronę"
                >
                  <Globe className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setThemeModal(site.id)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-purple-400 transition-colors"
                  title="Zainstaluj motyw"
                >
                  <Palette className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleUninstall(site.id, site.domain)}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Usuń WordPress"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Install Theme Modal */}
      {themeModal && (
        <InstallThemeModal
          siteId={themeModal}
          onClose={() => setThemeModal(null)}
        />
      )}

      {/* Install Modal */}
      {showInstall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowInstall(false)} />
          <div className="glass-card relative w-full max-w-lg rounded-2xl p-6 border border-white/10 shadow-2xl z-10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Zainstaluj WordPress</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Automatyczna instalacja przez WP-CLI</p>
              </div>
              <button onClick={() => setShowInstall(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInstall} className="space-y-4">
              {/* Strona */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  <Globe className="w-3.5 h-3.5 inline mr-1" />Strona WWW
                </label>
                <select
                  name="siteId"
                  required
                  className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
                >
                  <option value="">Wybierz domenę...</option>
                  {availableSites.map((s) => (
                    <option key={s.id} value={s.id}>{s.domain}</option>
                  ))}
                </select>
              </div>

              {/* Baza danych */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  <DbIcon className="w-3.5 h-3.5 inline mr-1" />Baza danych
                </label>
                <select
                  name="databaseId"
                  required
                  className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
                >
                  <option value="">Wybierz bazę danych...</option>
                  {databases.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.engine})
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">WordPress</p>
                <div className="space-y-3">
                  <Field label="Tytuł strony" name="siteTitle" placeholder="Moja strona" required />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Język" name="locale" type="select" options={LOCALES} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Motyw startowy</label>
                    <select
                      name="starterTheme"
                      className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
                    >
                      {STARTER_THEMES.map(t => (
                        <option key={t.slug} value={t.slug}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Konto admina WP</p>
                <div className="space-y-3">
                  <Field label="Nazwa użytkownika" name="adminUser" placeholder="admin" required />
                  <Field label="E-mail" name="adminEmail" type="email" placeholder="admin@example.com" required />
                  <Field label="Hasło" name="adminPassword" type="password" placeholder="min. 8 znaków" required />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowInstall(false)}>
                  Anuluj
                </Button>
                <Button type="submit" className="flex-1" disabled={installing}>
                  {installing ? (
                    <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Instaluję...</>
                  ) : (
                    <><Box className="w-4 h-4" /> Zainstaluj</>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  required,
  options,
}: {
  label: string
  name: string
  type?: string
  placeholder?: string
  required?: boolean
  options?: { value: string; label: string }[]
}) {
  const base = 'w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all'

  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      {type === 'select' && options ? (
        <select name={name} className={base}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={type}
          name={name}
          placeholder={placeholder}
          required={required}
          className={base}
        />
      )}
    </div>
  )
}

function InstallThemeModal({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const [theme, setTheme] = useState('astra')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const install = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post(`/api/wordpress/${siteId}/install-theme`, { theme, activate: true })
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch (err: any) {
      setError(err.message ?? 'Błąd')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative z-10 rounded-2xl p-6 w-full max-w-sm border border-white/10 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Zainstaluj motyw</h2>
        <form onSubmit={install} className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Motyw</label>
            <select
              className="w-full h-10 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
              value={theme}
              onChange={e => setTheme(e.target.value)}
            >
              {[
                { slug: 'astra', name: 'Astra' },
                { slug: 'hello-elementor', name: 'Hello Elementor' },
                { slug: 'generatepress', name: 'GeneratePress' },
                { slug: 'oceanwp', name: 'OceanWP' },
                { slug: 'neve', name: 'Neve' },
                { slug: 'kadence', name: 'Kadence' },
                { slug: 'blocksy', name: 'Blocksy' },
                { slug: 'storefront', name: 'Storefront (WooCommerce)' },
              ].map(t => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-green-400">Motyw zainstalowany i aktywowany!</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={onClose}>Anuluj</Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Instaluję...</>
              ) : (
                'Zainstaluj'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
