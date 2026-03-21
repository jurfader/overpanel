'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { Site } from '@overpanel/shared'
import {
  Globe, Shield, ShieldOff, ExternalLink,
  Trash2, MoreHorizontal, RefreshCw, Power, Settings,
  ArrowUpCircle, Loader2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface SiteRowProps {
  site: Site & { user?: { name: string } }
  isAdmin: boolean
  onRefetch: () => void
}

interface PhpSettings {
  phpVersion: string
  memoryLimit: string
  uploadMaxFilesize: string
  postMaxSize: string
  maxExecutionTime: number
  maxInputTime: number
}

function PhpSettingsModal({ siteId, siteDomain, onClose }: { siteId: string; siteDomain: string; onClose: () => void }) {
  const [settings, setSettings] = useState<PhpSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    api.get<PhpSettings>(`/api/php/site/${siteId}`)
      .then(setSettings)
      .catch(() => setError('Błąd ładowania'))
      .finally(() => setLoading(false))
  }, [siteId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setError('')
    try {
      await api.put(`/api/php/site/${siteId}`, {
        phpVersion: settings.phpVersion,
        memoryLimit: settings.memoryLimit,
        uploadMaxFilesize: settings.uploadMaxFilesize,
        postMaxSize: settings.postMaxSize,
        maxExecutionTime: settings.maxExecutionTime,
        maxInputTime: settings.maxInputTime,
      })
      setSuccess(true)
      setTimeout(onClose, 1200)
    } catch (err: any) {
      setError(err.message ?? 'Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 rounded-2xl p-6 w-full max-w-md border border-white/10 space-y-4 bg-[#0A0A0F] shadow-2xl">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Ustawienia PHP — {siteDomain}</h2>
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Ładowanie...</p>
        ) : settings ? (
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1.5">Wersja PHP</label>
              <select
                className="w-full h-9 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]/40"
                value={settings.phpVersion}
                onChange={e => setSettings(s => s ? { ...s, phpVersion: e.target.value } : s)}
              >
                {['7.4', '8.0', '8.1', '8.2', '8.3'].map(v => (
                  <option key={v} value={v}>PHP {v}</option>
                ))}
              </select>
            </div>
            {[
              { key: 'memoryLimit', label: 'Memory Limit', placeholder: '256M' },
              { key: 'uploadMaxFilesize', label: 'Upload Max Filesize', placeholder: '64M' },
              { key: 'postMaxSize', label: 'Post Max Size', placeholder: '64M' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">{label}</label>
                <input
                  className="w-full h-9 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]/40"
                  value={(settings as any)[key]}
                  onChange={e => setSettings(s => s ? { ...s, [key]: e.target.value } : s)}
                  placeholder={placeholder}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1.5">Max Execution Time (s)</label>
              <input
                type="number"
                className="w-full h-9 px-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]/40"
                value={settings.maxExecutionTime}
                onChange={e => setSettings(s => s ? { ...s, maxExecutionTime: parseInt(e.target.value) || 60 } : s)}
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && <p className="text-xs text-green-400">Zapisano pomyślnie</p>}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" type="button" onClick={onClose}>Anuluj</Button>
              <Button type="submit" loading={saving}>Zapisz</Button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    </div>
  )
}

interface UpdateInfo {
  hasUpdate: boolean
  type: 'wordpress' | 'overcms' | null
  currentVersion?: string
  latestVersion?: string
  commits?: number
  changes?: string[]
}

export function SiteRow({ site, isAdmin, onRefetch }: SiteRowProps) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [phpModal, setPhpModal] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updating, setUpdating] = useState(false)

  const hasCms = site.hasWordpress || site.siteType === 'overcms'

  // Check for updates on mount for CMS sites
  useEffect(() => {
    if (!hasCms) return
    checkUpdate()
  }, [site.id])

  const checkUpdate = async () => {
    setCheckingUpdate(true)
    try {
      const info = await api.get<UpdateInfo>(`/api/sites/${site.id}/check-update`)
      setUpdateInfo(info)
    } catch {}
    setCheckingUpdate(false)
  }

  const handleUpdate = async () => {
    if (!confirm(`Zaktualizować CMS na ${site.domain}?`)) return
    setUpdating(true)
    try {
      await api.post(`/api/sites/${site.id}/update-cms`)
      // For WP it's synchronous, for OverCMS it's async
      if (site.hasWordpress) {
        onRefetch()
      } else {
        alert('Aktualizacja OverCMS uruchomiona w tle. Docker rebuild może potrwać kilka minut.')
      }
      setUpdateInfo(u => u ? { ...u, hasUpdate: false } : u)
    } catch (err: any) {
      alert(err.message || 'Błąd podczas aktualizacji')
    }
    setUpdating(false)
  }

  const handleDelete = async () => {
    if (!confirm(`Usunąć stronę ${site.domain}? Tej operacji nie można cofnąć.`)) return
    setDeleting(true)
    try {
      await api.delete(`/api/sites/${site.id}`)
      onRefetch()
    } catch {
      alert('Błąd podczas usuwania strony')
    } finally {
      setDeleting(false)
    }
  }

  const toggleStatus = async () => {
    const newStatus = site.status === 'active' ? 'inactive' : 'active'
    await api.patch(`/api/sites/${site.id}`, { status: newStatus })
    onRefetch()
  }

  return (
    <>
      <div className="flex items-center gap-4 p-4 rounded-xl hover:bg-white/[0.03] transition-colors group">
        {/* Status dot */}
        <div className="flex-shrink-0">
          <span className={`block w-2.5 h-2.5 rounded-full ${
            site.status === 'active' ? 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]' :
            site.status === 'pending' ? 'bg-yellow-400 animate-pulse' :
            'bg-red-400'
          }`} />
        </div>

        {/* Domain */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {site.domain}
            </span>
            <a
              href={`http${site.hasSSL ? 's' : ''}://${site.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--primary)]" />
            </a>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-[var(--text-muted)]">{site.documentRoot}</span>
            {isAdmin && site.user && (
              <span className="text-xs text-[var(--text-muted)]">· {site.user.name}</span>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="hidden md:flex items-center gap-2">
          <Badge variant="neutral">PHP {site.phpVersion}</Badge>
          {site.hasSSL ? (
            <Badge variant="success">
              <Shield className="w-3 h-3" /> SSL
            </Badge>
          ) : (
            <Badge variant="warning">
              <ShieldOff className="w-3 h-3" /> No SSL
            </Badge>
          )}
          <Badge variant={site.status === 'active' ? 'success' : site.status === 'pending' ? 'warning' : 'error'}>
            {site.status === 'active' ? 'Aktywna' : site.status === 'pending' ? 'Konfigurowanie...' : 'Nieaktywna'}
          </Badge>
          {updateInfo?.hasUpdate && (
            <Badge variant="brand">
              <ArrowUpCircle className="w-3 h-3" />
              {updateInfo.type === 'wordpress'
                ? `WP ${updateInfo.latestVersion}`
                : `${updateInfo.commits} zmian`}
            </Badge>
          )}
        </div>

        {/* SSL expiry */}
        {site.sslExpiry && (
          <span className="hidden xl:block text-xs text-[var(--text-muted)] flex-shrink-0">
            SSL do {formatDate(site.sslExpiry)}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          {updateInfo?.hasUpdate && (
            <Button variant="secondary" size="sm" onClick={handleUpdate} loading={updating} title="Aktualizuj CMS">
              <ArrowUpCircle className="w-4 h-4 text-[var(--primary)]" />
            </Button>
          )}
          {hasCms && !updateInfo?.hasUpdate && (
            <button
              onClick={checkUpdate}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
              title="Sprawdź aktualizacje"
            >
              {checkingUpdate ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          )}
          {(site.siteType === 'php' || !site.siteType) && (
            <button
              onClick={() => setPhpModal(true)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
              title="Ustawienia PHP"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
          <Button variant="ghost" size="sm" onClick={toggleStatus} title={site.status === 'active' ? 'Dezaktywuj' : 'Aktywuj'}>
            <Power className="w-4 h-4" />
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {phpModal && (
        <PhpSettingsModal
          siteId={site.id}
          siteDomain={site.domain}
          onClose={() => setPhpModal(false)}
        />
      )}
    </>
  )
}
