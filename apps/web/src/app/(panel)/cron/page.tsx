'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useApi } from '@/hooks/use-api'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  Clock,
  Plus,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Terminal,
  Globe,
  Calendar,
  Activity,
  AlertCircle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CronJob {
  id: string
  name: string
  schedule: string
  command: string
  isActive: boolean
  lastRunAt: string | null
  lastStatus: 'success' | 'failed' | null
  lastOutput: string | null
  createdAt: string
  site?: { domain: string } | null
}

interface Site {
  id: string
  domain: string
}

// ─── Schedule presets ─────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Co minutę',  expr: '* * * * *',   desc: 'Uruchamia się co minutę' },
  { label: 'Co 5 minut', expr: '*/5 * * * *', desc: 'Co 5 minut' },
  { label: 'Co godzinę', expr: '0 * * * *',   desc: 'Co godzinę, o pełnej' },
  { label: 'Codziennie', expr: '0 2 * * *',   desc: 'Codziennie o 02:00' },
  { label: 'Co tydzień', expr: '0 2 * * 0',   desc: 'Co niedzielę o 02:00' },
  { label: 'Co miesiąc', expr: '0 2 1 * *',   desc: '1. dnia miesiąca o 02:00' },
  { label: 'Własny',     expr: '',             desc: 'Wprowadź wyrażenie ręcznie' },
] as const

function describeCron(expr: string): string {
  const match = PRESETS.find((p) => p.expr === expr)
  if (match) return match.desc
  return expr
}

// ─── Toggle switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={[
        'relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 flex-shrink-0',
        'focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        checked
          ? 'gradient-brand shadow-[0_0_10px_rgba(233,30,140,0.35)]'
          : 'bg-white/10 border border-white/15',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  )
}

// ─── Add Cron Modal ────────────────────────────────────────────────────────────

interface AddCronModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function AddCronModal({ open, onClose, onSuccess }: AddCronModalProps) {
  const { data: sites } = useApi<Site[]>('/api/sites')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<number>(0)
  const [customExpr, setCustomExpr] = useState('')
  const [form, setForm] = useState({ name: '', command: '', siteId: '' })

  const isCustom = selectedPreset === PRESETS.length - 1
  const currentExpr = isCustom ? customExpr : PRESETS[selectedPreset].expr

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleClose = () => {
    setForm({ name: '', command: '', siteId: '' })
    setSelectedPreset(0)
    setCustomExpr('')
    setError('')
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentExpr.trim()) {
      setError('Wprowadź wyrażenie cron')
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post('/api/cron', {
        name: form.name,
        command: form.command,
        schedule: currentExpr.trim(),
        ...(form.siteId ? { siteId: form.siteId } : {}),
      })
      onSuccess()
      handleClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas tworzenia zadania')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nowe zadanie Cron"
      description="Zaplanuj automatyczne uruchamianie polecenia"
      size="lg"
    >
      {error && (
        <div className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <Input
          label="Nazwa zadania"
          placeholder="np. Laravel Scheduler"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          icon={<Clock className="w-4 h-4" />}
          required
        />

        {/* Command */}
        <Input
          label="Polecenie"
          placeholder="/var/www/example.com/public/artisan schedule:run"
          value={form.command}
          onChange={(e) => set('command', e.target.value)}
          icon={<Terminal className="w-4 h-4" />}
          required
        />

        {/* Site association */}
        <Select
          label="Przypisz do strony (opcjonalnie)"
          value={form.siteId}
          onChange={(e) => set('siteId', e.target.value)}
        >
          <option value="">— bez przypisania —</option>
          {(sites ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.domain}
            </option>
          ))}
        </Select>

        {/* Schedule builder */}
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
            Harmonogram
          </p>

          {/* Preset pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map((preset, i) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setSelectedPreset(i)}
                className={[
                  'px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150',
                  selectedPreset === i
                    ? 'gradient-brand text-white shadow-[0_0_12px_rgba(233,30,140,0.3)]'
                    : 'glass text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-white/10',
                ].join(' ')}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom expression input */}
          {isCustom && (
            <div className="mb-3">
              <Input
                placeholder="np. */5 * * * *"
                value={customExpr}
                onChange={(e) => setCustomExpr(e.target.value)}
                icon={<Calendar className="w-4 h-4" />}
              />
            </div>
          )}

          {/* Expression preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Wyrażenie Cron
              </p>
              <code className="text-sm font-mono text-[var(--primary)]">
                {currentExpr || <span className="text-[var(--text-muted)] italic">nie ustawiono</span>}
              </code>
            </div>
            {currentExpr && (
              <Badge variant="brand" className="flex-shrink-0">
                {describeCron(currentExpr)}
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={handleClose}
          >
            Anuluj
          </Button>
          <Button type="submit" className="flex-1" loading={loading}>
            {!loading && <><Plus className="w-4 h-4" /> Utwórz zadanie</>}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Row output expander ───────────────────────────────────────────────────────

function OutputPanel({ output }: { output: string | null }) {
  if (!output) {
    return (
      <p className="py-4 text-center text-xs text-[var(--text-muted)] italic">
        Brak danych wyjściowych
      </p>
    )
  }
  return (
    <pre className="max-h-48 overflow-auto text-xs font-mono text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap break-all">
      {output}
    </pre>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CronPage() {
  const { data, loading, error, refetch } = useApi<CronJob[]>('/api/cron')
  const [showAdd, setShowAdd] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const jobs = data ?? []

  const stats = {
    total: jobs.length,
    active: jobs.filter((j) => j.isActive).length,
    failed: jobs.filter((j) => j.lastStatus === 'failed').length,
  }

  const handleToggle = async (job: CronJob) => {
    setToggling(job.id)
    try {
      await api.patch(`/api/cron/${job.id}`, { isActive: !job.isActive })
      refetch()
    } catch {
      // silently ignore, refetch will restore correct state
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (job: CronJob) => {
    if (!confirm(`Usunąć zadanie "${job.name}"? Tej operacji nie można cofnąć.`)) return
    setDeleting(job.id)
    try {
      await api.delete(`/api/cron/${job.id}`)
      refetch()
    } finally {
      setDeleting(null)
    }
  }

  const toggleExpand = (id: string) =>
    setExpanded((prev) => (prev === id ? null : id))

  return (
    <div className="min-h-screen">
      <Topbar
        title="Cron Jobs"
        subtitle="Zaplanowane zadania systemowe"
      />

      <div className="p-6 space-y-5">
        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4">
          {/* Total */}
          <div className="glass-card rounded-2xl p-4 flex items-center gap-3 border border-white/[0.08]">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)] leading-none">
                {jobs.length}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Wszystkich zadań</p>
            </div>
          </div>

          {/* Active */}
          <div className="glass-card rounded-2xl p-4 flex items-center gap-3 border border-white/[0.08]">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Activity className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)] leading-none">
                {stats.active}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Aktywnych</p>
            </div>
          </div>

          {/* Failed */}
          <div className="glass-card rounded-2xl p-4 flex items-center gap-3 border border-white/[0.08]">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <XCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)] leading-none">
                {stats.failed}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Błąd ostatniego uruch.</p>
            </div>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--text-muted)]">
            {loading ? 'Ładowanie…' : `${jobs.length} zadań w systemie`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refetch} title="Odśwież">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" />
              Nowe zadanie
            </Button>
          </div>
        </div>

        {/* ── Jobs table ── */}
        <Card className="p-0 overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            <span className="w-5" />
            <span className="w-5" />
            <span className="flex-1">Nazwa / Polecenie</span>
            <span className="hidden md:block w-44">Harmonogram</span>
            <span className="hidden lg:block w-36">Strona</span>
            <span className="hidden xl:block w-40">Ostatnie uruchomienie</span>
            <span className="w-24 text-right">Akcje</span>
          </div>

          {/* Loading */}
          {loading && (
            <div className="py-14 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="py-10 flex flex-col items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-6 h-6" />
              <p>Błąd podczas ładowania: {error}</p>
              <Button variant="secondary" size="sm" onClick={refetch}>
                Spróbuj ponownie
              </Button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && jobs.length === 0 && (
            <EmptyState
              icon={Clock}
              title="Brak zadań Cron"
              description="Utwórz pierwsze zaplanowane zadanie systemowe"
              action={{ label: 'Nowe zadanie', onClick: () => setShowAdd(true) }}
            />
          )}

          {/* Rows */}
          {!loading && !error && jobs.map((job) => {
            const isExpanded = expanded === job.id
            const isTogglingThis = toggling === job.id
            const isDeletingThis = deleting === job.id

            return (
              <div key={job.id} className="border-b border-white/[0.04] last:border-0">
                {/* Main row */}
                <div
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.025] transition-colors group"
                >
                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(job.id)}
                    className="w-5 h-5 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
                    title={isExpanded ? 'Zwiń' : 'Rozwiń output'}
                  >
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5" />
                      : <ChevronRight className="w-3.5 h-3.5" />
                    }
                  </button>

                  {/* Active dot */}
                  <div className="w-5 flex items-center justify-center flex-shrink-0">
                    <span
                      className={[
                        'w-2 h-2 rounded-full flex-shrink-0',
                        job.isActive
                          ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]'
                          : 'bg-white/15',
                      ].join(' ')}
                    />
                  </div>

                  {/* Name + command */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {job.name}
                    </p>
                    <p className="text-xs font-mono text-[var(--text-muted)] truncate mt-0.5">
                      {job.command}
                    </p>
                  </div>

                  {/* Schedule */}
                  <div className="hidden md:flex items-center gap-2 w-44 flex-shrink-0">
                    <code className="text-xs font-mono text-[var(--text-secondary)] bg-white/[0.05] px-1.5 py-0.5 rounded-md border border-white/[0.08] truncate max-w-[100px]">
                      {job.schedule}
                    </code>
                    <span className="text-xs text-[var(--text-muted)] truncate hidden xl:block">
                      {describeCron(job.schedule)}
                    </span>
                  </div>

                  {/* Site */}
                  <div className="hidden lg:flex items-center gap-1.5 w-36 flex-shrink-0">
                    {job.site ? (
                      <>
                        <Globe className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-secondary)] truncate">
                          {job.site.domain}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-[var(--text-muted)]">—</span>
                    )}
                  </div>

                  {/* Last run */}
                  <div className="hidden xl:flex items-center gap-2 w-40 flex-shrink-0">
                    {job.lastStatus === 'success' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    )}
                    {job.lastStatus === 'failed' && (
                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    )}
                    <span className="text-xs text-[var(--text-secondary)] truncate">
                      {job.lastRunAt ? formatDate(job.lastRunAt) : 'Nigdy'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 w-24 justify-end flex-shrink-0">
                    <ToggleSwitch
                      checked={job.isActive}
                      onChange={() => handleToggle(job)}
                      disabled={isTogglingThis}
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(job)}
                      disabled={isDeletingThis}
                      title="Usuń zadanie"
                      className={[
                        'w-7 h-7 rounded-lg flex items-center justify-center transition-all',
                        'text-[var(--text-muted)] hover:text-red-400',
                        'hover:bg-red-500/10 border border-transparent hover:border-red-500/20',
                        'opacity-0 group-hover:opacity-100',
                        'disabled:opacity-30 disabled:cursor-not-allowed',
                      ].join(' ')}
                    >
                      {isDeletingThis
                        ? <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />
                      }
                    </button>
                  </div>
                </div>

                {/* Expanded output panel */}
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <div className="rounded-xl border border-white/[0.07] bg-black/30 overflow-hidden">
                      {/* Output header */}
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          <span className="text-xs text-[var(--text-muted)] font-medium">
                            Ostatnie wyjście
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Mobile schedule */}
                          <span className="md:hidden text-xs font-mono text-[var(--text-muted)]">
                            {job.schedule}
                          </span>
                          {job.lastStatus === 'success' && (
                            <Badge variant="success">
                              <CheckCircle2 className="w-3 h-3" />
                              Sukces
                            </Badge>
                          )}
                          {job.lastStatus === 'failed' && (
                            <Badge variant="error">
                              <XCircle className="w-3 h-3" />
                              Błąd
                            </Badge>
                          )}
                          {job.lastRunAt && (
                            <span className="text-xs text-[var(--text-muted)]">
                              {formatDate(job.lastRunAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Output body */}
                      <div className="p-3">
                        <OutputPanel output={job.lastOutput} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      </div>

      {/* Add modal */}
      <AddCronModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={refetch}
      />
    </div>
  )
}
