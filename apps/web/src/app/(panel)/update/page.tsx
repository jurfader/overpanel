'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  GitCommit,
  Package,
  Loader2,
  Shield,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckResult {
  hasUpdates: boolean
  commits: string[]
  currentVersion: string
}

interface UpdateStatus {
  status: 'idle' | 'running' | 'success' | 'failed'
  log: string[]
  startedAt?: string
  completedAt?: string
}

// ── Access Denied ──────────────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <div className="min-h-screen">
      <Topbar title="Aktualizacja systemu" subtitle="Zarządzaj wersją OVERPANEL" />
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <Shield className="w-7 h-7 text-red-400" />
        </div>
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          Brak dostępu — ta strona jest dostępna tylko dla administratorów.
        </p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UpdatePage() {
  const user = useAuthStore((s) => s.user)

  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: 'idle', log: [] })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [updateStatus.log])

  // Poll update status when running
  useEffect(() => {
    if (updateStatus.status !== 'running') return
    const interval = setInterval(async () => {
      try {
        const data = await api.get<UpdateStatus>('/api/system/update-status')
        setUpdateStatus(data)
        if (data.status === 'success' || data.status === 'failed') {
          clearInterval(interval)
        }
      } catch {
        // ignore transient polling errors
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [updateStatus.status])

  const checkForUpdates = useCallback(async () => {
    setChecking(true)
    setCheckError(null)
    try {
      const data = await api.get<CheckResult>('/api/system/update-check')
      setCheckResult(data)
    } catch (err) {
      setCheckError(err instanceof ApiError ? err.message : 'Błąd sprawdzania aktualizacji')
    } finally {
      setChecking(false)
    }
  }, [])

  const startUpdate = async () => {
    setStarting(true)
    setStartError(null)
    try {
      await api.post('/api/system/update', {})
      setUpdateStatus({ status: 'running', log: ['Aktualizacja uruchomiona...'] })
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : 'Nie można uruchomić aktualizacji')
    } finally {
      setStarting(false)
    }
  }

  useEffect(() => {
    checkForUpdates()
  }, [checkForUpdates])

  // Admin guard (after all hooks)
  if (user && user.role !== 'admin') {
    return <AccessDenied />
  }

  const isRunning = updateStatus.status === 'running'
  const isDone = updateStatus.status === 'success' || updateStatus.status === 'failed'
  const showLog = updateStatus.status !== 'idle'

  return (
    <div className="min-h-screen">
      <Topbar title="Aktualizacja systemu" subtitle="Zarządzaj wersją OVERPANEL" />

      <div className="p-6 space-y-5 max-w-3xl">

        {/* ── Version info card ────────────────────────────────────────────── */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
              <Package className="w-4.5 h-4.5 text-[var(--primary)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Wersja systemu</p>
              <p className="text-xs text-[var(--text-muted)]">Aktualnie zainstalowana wersja OVERPANEL</p>
            </div>
          </div>

          {/* Version row */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
              Aktualna wersja:
            </span>

            {checking && !checkResult ? (
              <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            ) : checkResult ? (
              <>
                <code className="text-sm font-mono text-[var(--text-primary)] bg-white/[0.05] px-2 py-0.5 rounded-lg">
                  {checkResult.currentVersion}
                </code>
                {checkResult.hasUpdates ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Dostępna aktualizacja
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    Aktualna
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">—</span>
            )}

            <div className="ml-auto">
              <Button variant="secondary" size="sm" onClick={checkForUpdates} loading={checking} disabled={isRunning}>
                <RefreshCw className="w-3.5 h-3.5" />
                Sprawdź ponownie
              </Button>
            </div>
          </div>

          {/* Check error */}
          {checkError && (
            <div className="mt-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {checkError}
            </div>
          )}
        </Card>

        {/* ── Updates available ─────────────────────────────────────────────── */}
        {checkResult && checkResult.hasUpdates && updateStatus.status === 'idle' && (
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <GitCommit className="w-4.5 h-4.5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Dostępne zmiany</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {checkResult.commits.length} {checkResult.commits.length === 1 ? 'commit' : 'commity/ów'} do wdrożenia
                </p>
              </div>
            </div>

            {/* Commits list */}
            <div className="space-y-1.5 mb-5">
              {checkResult.commits.map((commit, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                >
                  <span className="text-[var(--primary)] mt-0.5 flex-shrink-0">•</span>
                  <code className="text-xs font-mono text-[var(--text-secondary)] break-all">{commit}</code>
                </div>
              ))}
            </div>

            {/* Start error */}
            {startError && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {startError}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={startUpdate} loading={starting}>
                <RefreshCw className="w-4 h-4" />
                Aktualizuj teraz
              </Button>
            </div>
          </Card>
        )}

        {/* ── Up to date ────────────────────────────────────────────────────── */}
        {checkResult && !checkResult.hasUpdates && updateStatus.status === 'idle' && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <p className="text-sm font-medium text-green-400">System jest aktualny. Brak nowych aktualizacji.</p>
          </div>
        )}

        {/* ── Log terminal ──────────────────────────────────────────────────── */}
        {showLog && (
          <Card className="p-0 overflow-hidden">
            {/* Terminal header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber-400 animate-pulse' : updateStatus.status === 'success' ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {isRunning ? 'Trwa aktualizacja...' : updateStatus.status === 'success' ? 'Aktualizacja zakończona' : 'Aktualizacja nieudana'}
              </span>
              {isRunning && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin ml-auto" />}
            </div>

            {/* Log output */}
            <div
              className="h-80 overflow-y-auto p-4 font-mono text-xs leading-relaxed"
              style={{ backgroundColor: '#0a0a0f' }}
            >
              {updateStatus.log.map((line, i) => (
                <div key={i} className="text-green-400 whitespace-pre-wrap break-all">
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </Card>
        )}

        {/* ── Success banner ────────────────────────────────────────────────── */}
        {updateStatus.status === 'success' && (
          <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-400">Aktualizacja zakończona pomyślnie.</p>
              <p className="text-xs text-green-400/70 mt-0.5">Panel został zrestartowany.</p>
            </div>
          </div>
        )}

        {/* ── Failure banner ────────────────────────────────────────────────── */}
        {updateStatus.status === 'failed' && (
          <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">Aktualizacja nie powiodła się.</p>
              {updateStatus.log.length > 0 && (
                <p className="text-xs text-red-400/70 mt-0.5 font-mono break-all">
                  {updateStatus.log[updateStatus.log.length - 1]}
                </p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
