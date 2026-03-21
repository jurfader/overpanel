'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import {
  Box,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Terminal,
  Plus,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  Container,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Cpu,
  HardDrive,
  Layers,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DockerStatus {
  available: boolean
  version?: string
}

interface DockerContainer {
  id: string
  name: string
  displayName: string
  image: string
  domain?: string
  internalPort?: number
  externalPort?: number
  status: 'running' | 'stopped' | 'deploying' | 'error'
  template?: string
  liveStatus?: 'running' | 'exited' | null
  liveStatusText?: string
  ports?: string
}

interface EnvVar {
  key: string
  label: string
  description?: string
  required: boolean
  secret?: boolean
  default?: string
  generated?: 'password' | 'secret'
}

interface DockerTemplate {
  id: string
  name: string
  description: string
  category: 'cms' | 'dev' | 'productivity' | 'monitoring' | 'misc'
  image: string
  defaultInternalPort: number
  icon: string
  envVars: EnvVar[]
  volumes: string[]
  setupNotes?: string
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

let toastCounter = 0

function getCategoryLabel(cat: DockerTemplate['category']): string {
  const map: Record<DockerTemplate['category'], string> = {
    cms: 'CMS',
    dev: 'Dev',
    productivity: 'Produktywność',
    monitoring: 'Monitoring',
    misc: 'Inne',
  }
  return map[cat] ?? cat
}

function getCategoryVariant(
  cat: DockerTemplate['category']
): 'brand' | 'info' | 'success' | 'warning' | 'neutral' {
  const map: Record<
    DockerTemplate['category'],
    'brand' | 'info' | 'success' | 'warning' | 'neutral'
  > = {
    cms: 'brand',
    dev: 'info',
    productivity: 'success',
    monitoring: 'warning',
    misc: 'neutral',
  }
  return map[cat] ?? 'neutral'
}

function StatusDot({ container }: { container: DockerContainer }) {
  if (container.liveStatus === 'running') {
    return (
      <span className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.8)] flex-shrink-0 animate-pulse" />
    )
  }
  if (container.status === 'deploying') {
    return (
      <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.8)] flex-shrink-0 animate-pulse" />
    )
  }
  return <span className="w-2.5 h-2.5 rounded-full bg-red-400/70 flex-shrink-0" />
}

function StatusBadge({ container }: { container: DockerContainer }) {
  if (container.liveStatus === 'running') {
    return (
      <Badge variant="success">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_4px_rgba(34,197,94,0.7)]" />
        Aktywny
      </Badge>
    )
  }
  if (container.status === 'deploying') {
    return (
      <Badge variant="warning">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        Wdrażanie
      </Badge>
    )
  }
  if (container.status === 'error') {
    return (
      <Badge variant="error">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Błąd
      </Badge>
    )
  }
  return (
    <Badge variant="neutral">
      <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
      Zatrzymany
    </Badge>
  )
}

// ─── Logs Modal ────────────────────────────────────────────────────────────────

function LogsModal({
  container,
  onClose,
}: {
  container: DockerContainer | null
  onClose: () => void
}) {
  const [lines, setLines] = useState(100)
  const [logs, setLogs] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchLogs = useCallback(async () => {
    if (!container) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ logs: string }>(
        `/api/docker/${container.name}/logs?lines=${lines}`
      )
      setLogs(data.logs)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie można załadować logów')
    } finally {
      setLoading(false)
    }
  }, [container, lines])

  useEffect(() => {
    if (container) fetchLogs()
  }, [container, fetchLogs])

  useEffect(() => {
    if (logs && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  useEffect(() => {
    if (!container) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [container, onClose])

  if (!container) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card rounded-2xl border border-white/10 shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center flex-shrink-0">
              <Terminal className="w-4 h-4 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Logi:{' '}
                <span className="gradient-brand-text">{container.displayName}</span>
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-mono">{container.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Select
              value={String(lines)}
              onChange={(e) => setLines(Number(e.target.value))}
              className="h-8 text-xs w-28"
            >
              <option value="50">50 linii</option>
              <option value="100">100 linii</option>
              <option value="200">200 linii</option>
              <option value="500">500 linii</option>
            </Select>
            <Button variant="secondary" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-all"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal body */}
        <div className="flex-1 overflow-y-auto bg-black/60 rounded-b-2xl p-4 font-mono text-xs leading-relaxed min-h-[320px]">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)]" />
              <span className="ml-2 text-[var(--text-muted)]">Ładowanie logów...</span>
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center gap-2 py-8 justify-center text-red-400">
              <XCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && logs && (
            <pre className="text-green-300/80 whitespace-pre-wrap break-all">
              {logs}
              <div ref={bottomRef} />
            </pre>
          )}
          {!loading && !error && !logs && (
            <p className="text-[var(--text-muted)] py-8 text-center">Brak logów</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Deploy Modal ──────────────────────────────────────────────────────────────

function DeployModal({
  open,
  onClose,
  onDeployed,
}: {
  open: boolean
  onClose: () => void
  onDeployed: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [templates, setTemplates] = useState<DockerTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<DockerTemplate | null>(null)
  const [isCustom, setIsCustom] = useState(false)

  // Step 2 form state
  const [displayName, setDisplayName] = useState('')
  const [containerName, setContainerName] = useState('')
  const [image, setImage] = useState('')
  const [domain, setDomain] = useState('')
  const [internalPort, setInternalPort] = useState('')
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  // Reset on open
  useEffect(() => {
    if (!open) return
    setStep(1)
    setSelectedTemplate(null)
    setIsCustom(false)
    setDisplayName('')
    setContainerName('')
    setImage('')
    setDomain('')
    setInternalPort('')
    setEnvValues({})
    setDeployError(null)
  }, [open])

  // Load templates
  useEffect(() => {
    if (!open) return
    setLoadingTemplates(true)
    api
      .get<DockerTemplate[]>('/api/docker/templates')
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false))
  }, [open])

  // Keyboard close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleSelectTemplate = (tpl: DockerTemplate | null) => {
    if (tpl === null) {
      setIsCustom(true)
      setSelectedTemplate(null)
      setImage('')
      setInternalPort('')
      setEnvValues({})
    } else {
      setIsCustom(false)
      setSelectedTemplate(tpl)
      setImage(tpl.image)
      setInternalPort(String(tpl.defaultInternalPort))
      const defaults: Record<string, string> = {}
      for (const ev of tpl.envVars) {
        if (ev.default) defaults[ev.key] = ev.default
      }
      setEnvValues(defaults)
    }
    setStep(2)
  }

  const handleDisplayNameChange = (val: string) => {
    setDisplayName(val)
    setContainerName(
      val
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    )
  }

  const handleDeploy = async () => {
    if (!displayName.trim() || !image.trim()) return
    setDeploying(true)
    setDeployError(null)
    try {
      await api.post('/api/docker/deploy', {
        templateId: selectedTemplate?.id ?? null,
        displayName: displayName.trim(),
        name: containerName.trim() || undefined,
        image: image.trim(),
        domain: domain.trim() || undefined,
        internalPort: internalPort ? Number(internalPort) : undefined,
        env: envValues,
      })
      onDeployed()
      onClose()
    } catch (err) {
      setDeployError(err instanceof ApiError ? err.message : 'Błąd podczas wdrażania')
    } finally {
      setDeploying(false)
    }
  }

  const envVarsList = selectedTemplate?.envVars ?? []

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.06] flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {step === 1 ? 'Wybierz szablon' : 'Konfiguracja kontenera'}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {step === 1
                ? 'Wybierz gotowy szablon lub skonfiguruj własny obraz'
                : selectedTemplate
                  ? `Szablon: ${selectedTemplate.name}`
                  : 'Własny obraz Docker'}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full transition-all ${
                  step === 1
                    ? 'bg-[var(--primary)] shadow-[0_0_6px_rgba(233,30,140,0.7)]'
                    : 'bg-white/20'
                }`}
              />
              <div
                className={`w-2 h-2 rounded-full transition-all ${
                  step === 2
                    ? 'bg-[var(--primary)] shadow-[0_0_6px_rgba(233,30,140,0.7)]'
                    : 'bg-white/20'
                }`}
              />
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-all"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ── Step 1: template picker ── */}
          {step === 1 && (
            <div>
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)]" />
                  <span className="ml-2 text-sm text-[var(--text-muted)]">
                    Ładowanie szablonów...
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => handleSelectTemplate(tpl)}
                      className="text-left p-4 rounded-xl border border-white/10 bg-white/[0.03]
                        hover:bg-[var(--primary)]/5 hover:border-[var(--primary)]/40
                        hover:shadow-[0_0_16px_rgba(233,30,140,0.12)] transition-all group"
                    >
                      <div className="text-2xl mb-2 leading-none">{tpl.icon}</div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-white mb-0.5">
                        {tpl.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-2 line-clamp-2">
                        {tpl.description}
                      </p>
                      <Badge variant={getCategoryVariant(tpl.category)}>
                        {getCategoryLabel(tpl.category)}
                      </Badge>
                    </button>
                  ))}

                  {/* Custom image card */}
                  <button
                    onClick={() => handleSelectTemplate(null)}
                    className="text-left p-4 rounded-xl border border-dashed border-white/20 bg-white/[0.02]
                      hover:bg-[var(--primary)]/5 hover:border-[var(--primary)]/40
                      hover:shadow-[0_0_16px_rgba(233,30,140,0.12)] transition-all group"
                  >
                    <div className="text-2xl mb-2 leading-none">📦</div>
                    <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-white mb-0.5">
                      Własny obraz
                    </p>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-2">
                      Skonfiguruj dowolny obraz Docker ręcznie
                    </p>
                    <Badge variant="neutral">Własny</Badge>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: config form ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Template info banner */}
              {selectedTemplate && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/15">
                  <span className="text-xl leading-none">{selectedTemplate.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {selectedTemplate.name}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate font-mono">
                      {selectedTemplate.image}
                    </p>
                  </div>
                  <Badge variant={getCategoryVariant(selectedTemplate.category)}>
                    {getCategoryLabel(selectedTemplate.category)}
                  </Badge>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Nazwa wyświetlana"
                  placeholder="Mój WordPress"
                  value={displayName}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                />
                <Input
                  label="Nazwa kontenera"
                  placeholder="moj-wordpress"
                  value={containerName}
                  onChange={(e) => setContainerName(e.target.value)}
                />
              </div>

              <Input
                label="Obraz Docker"
                placeholder="nginx:latest"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                disabled={!isCustom && !!selectedTemplate}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Domena (opcjonalna)"
                  placeholder="app.example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
                <Input
                  label="Port wewnętrzny"
                  placeholder="8080"
                  type="number"
                  value={internalPort}
                  onChange={(e) => setInternalPort(e.target.value)}
                />
              </div>

              {/* Env vars */}
              {envVarsList.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
                    Zmienne środowiskowe
                  </p>
                  <div className="space-y-3">
                    {envVarsList.map((ev) =>
                      ev.generated ? (
                        <div key={ev.key}>
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                            {ev.label}
                            {ev.required && (
                              <span className="text-[var(--primary)] ml-1">*</span>
                            )}
                          </label>
                          <div className="w-full h-10 rounded-xl flex items-center px-3 bg-white/[0.03] border border-white/10 text-[var(--text-muted)] text-xs font-mono gap-2">
                            <span className="text-base leading-none">🎲</span>
                            <span>Auto-generowane przez serwer</span>
                          </div>
                          {ev.description && (
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              {ev.description}
                            </p>
                          )}
                        </div>
                      ) : (
                        <Input
                          key={ev.key}
                          label={ev.required ? `${ev.label} *` : ev.label}
                          placeholder={ev.default ?? ev.key}
                          type={ev.secret ? 'password' : 'text'}
                          value={envValues[ev.key] ?? ''}
                          onChange={(e) =>
                            setEnvValues((prev) => ({ ...prev, [ev.key]: e.target.value }))
                          }
                        />
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Setup notes */}
              {selectedTemplate?.setupNotes && (
                <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/15 text-xs text-yellow-300/80 leading-relaxed">
                  <p className="font-semibold mb-1 text-yellow-300">Uwagi konfiguracyjne</p>
                  {selectedTemplate.setupNotes}
                </div>
              )}

              {deployError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  {deployError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — only on step 2 */}
        {step === 2 && (
          <div className="flex items-center justify-between p-5 border-t border-white/[0.06] flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep(1)}
              disabled={deploying}
            >
              <ChevronLeft className="w-4 h-4" />
              Wróć
            </Button>
            <Button
              size="sm"
              onClick={handleDeploy}
              loading={deploying}
              disabled={!displayName.trim() || !image.trim()}
            >
              <Play className="w-4 h-4" />
              Wdróż kontener
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Compose Tab ───────────────────────────────────────────────────────────────

function ComposeTab() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showDeploy, setShowDeploy] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [composeContent, setComposeContent] = useState(`version: '3.8'
services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: always`)
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState('')

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const data = await api.get<any[]>('/api/docker-compose')
      setProjects(data)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchProjects() }, [])

  const deploy = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeploying(true)
    setError('')
    try {
      await api.post('/api/docker-compose/deploy', { projectName, composeContent })
      setShowDeploy(false)
      setTimeout(fetchProjects, 3000)
    } catch (err: any) {
      setError(err.message ?? 'Błąd wdrożenia')
    } finally { setDeploying(false) }
  }

  const stopProject = async (name: string) => {
    await api.post(`/api/docker-compose/${name}/stop`, {}).catch(() => {})
    fetchProjects()
  }

  const startProject = async (name: string) => {
    await api.post(`/api/docker-compose/${name}/start`, {}).catch(() => {})
    fetchProjects()
  }

  const deleteProject = async (name: string) => {
    if (!confirm(`Usunąć projekt "${name}"? To zatrzyma i usunie wszystkie kontenery.`)) return
    await api.delete(`/api/docker-compose/${name}`).catch(() => {})
    fetchProjects()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">{projects.length} projektów</p>
        <Button onClick={() => setShowDeploy(true)} size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          Nowy projekt
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Ładowanie...</p>
      ) : projects.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-[var(--text-muted)]">Brak projektów Compose</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {projects.map(project => (
            <Card key={project.name}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1">
                  <p className="font-medium text-[var(--text-primary)]">{project.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{project.running}/{project.services?.length ?? 0} serwisów aktywnych</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => startProject(project.name)} className="p-1.5 rounded-lg hover:bg-white/10 text-green-400 transition-colors" title="Start">
                    <Play className="w-4 h-4" />
                  </button>
                  <button onClick={() => stopProject(project.name)} className="p-1.5 rounded-lg hover:bg-white/10 text-amber-400 transition-colors" title="Stop">
                    <Square className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteProject(project.name)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors" title="Usuń">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Deploy modal */}
      {showDeploy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeploy(false)} />
          <div className="glass relative z-10 rounded-2xl p-6 w-full max-w-2xl border border-white/10 space-y-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Nowy projekt Docker Compose</h2>
            <form onSubmit={deploy} className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">Nazwa projektu</label>
                <input className="input w-full" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="moj-projekt" required />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">docker-compose.yml</label>
                <textarea
                  className="input w-full h-64 font-mono text-xs resize-none"
                  value={composeContent}
                  onChange={e => setComposeContent(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" type="button" onClick={() => setShowDeploy(false)}>Anuluj</Button>
                <Button type="submit" loading={deploying}>Wdróż</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Admin Overview Tab ─────────────────────────────────────────────────────────

interface OverviewGroup {
  group: string
  type: 'overcms' | 'docker-compose' | 'standalone'
  containers: Array<{
    name: string
    image: string
    state: string
    status: string
    ports: string
    cpu: string
    memory: string
  }>
}

function OverviewTab() {
  const [groups, setGroups] = useState<OverviewGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<OverviewGroup[]>('/api/docker/admin-overview')
      setGroups(data)
      // Auto-expand all groups on first load
      if (expanded.size === 0) {
        setExpanded(new Set(data.map(g => g.group)))
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udalo sie pobrac danych')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  const toggleGroup = (group: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  function getTypeBadge(type: OverviewGroup['type']) {
    switch (type) {
      case 'overcms':
        return <Badge variant="brand">OverCMS</Badge>
      case 'docker-compose':
        return <Badge variant="info">Docker Compose</Badge>
      case 'standalone':
        return <Badge variant="neutral">Standalone</Badge>
    }
  }

  function getGroupRunningCount(group: OverviewGroup) {
    return group.containers.filter(c => c.state === 'running').length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-14">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
        <span className="ml-2 text-sm text-[var(--text-muted)]">Ladowanie przegladu...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <XCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm font-medium text-red-400">Blad ladowania</p>
          <p className="text-xs text-[var(--text-muted)]">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchOverview} className="mt-2">
            <RefreshCw className="w-4 h-4" /> Sprobuj ponownie
          </Button>
        </div>
      </Card>
    )
  }

  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Layers}
          title="Brak kontenerow"
          description="Na serwerze nie znaleziono zadnych kontenerow Docker"
        />
      </Card>
    )
  }

  const totalContainers = groups.reduce((sum, g) => sum + g.containers.length, 0)
  const totalRunning = groups.reduce((sum, g) => sum + getGroupRunningCount(g), 0)

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-sm text-[var(--text-secondary)]">
            {groups.length} grup &middot; {totalContainers} kontenerow &middot;{' '}
            <span className="text-green-400">{totalRunning} aktywnych</span>
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchOverview} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Odswiez
        </Button>
      </div>

      {/* Groups */}
      {groups.map(group => {
        const isExpanded = expanded.has(group.group)
        const runningCount = getGroupRunningCount(group)
        const allRunning = runningCount === group.containers.length
        const noneRunning = runningCount === 0

        return (
          <Card key={group.group} className="overflow-hidden">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.group)}
              className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors text-left"
            >
              {/* Expand icon */}
              <div className="flex-shrink-0 text-[var(--text-muted)]">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </div>

              {/* Status dot */}
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  allRunning
                    ? 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.8)]'
                    : noneRunning
                      ? 'bg-red-400/70'
                      : 'bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.6)]'
                }`}
              />

              {/* Group name */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {group.group}
                </span>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {getTypeBadge(group.type)}
                <Badge variant={allRunning ? 'success' : noneRunning ? 'neutral' : 'warning'}>
                  {runningCount}/{group.containers.length}
                </Badge>
              </div>
            </button>

            {/* Expanded container table */}
            {isExpanded && (
              <div className="border-t border-white/[0.06]">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[var(--text-muted)] uppercase tracking-widest border-b border-white/[0.04]">
                        <th className="text-left px-4 py-2.5 font-semibold">Kontener</th>
                        <th className="text-left px-4 py-2.5 font-semibold">Obraz</th>
                        <th className="text-left px-4 py-2.5 font-semibold">Stan</th>
                        <th className="text-left px-4 py-2.5 font-semibold">
                          <div className="flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</div>
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold">
                          <div className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> Pamiec</div>
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold">Porty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.containers.map(c => (
                        <tr
                          key={c.name}
                          className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  c.state === 'running'
                                    ? 'bg-green-400 shadow-[0_0_4px_rgba(34,197,94,0.7)]'
                                    : 'bg-red-400/60'
                                }`}
                              />
                              <span className="font-mono text-[var(--text-primary)] truncate max-w-[200px]">
                                {c.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[var(--text-muted)] truncate max-w-[180px]">
                            {c.image}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium ${
                                c.state === 'running'
                                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                  : c.state === 'exited'
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    : 'bg-white/5 text-[var(--text-muted)] border border-white/10'
                              }`}
                            >
                              {c.state === 'running' ? 'Aktywny' : c.state === 'exited' ? 'Zatrzymany' : c.state}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{c.cpu}</td>
                          <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{c.memory}</td>
                          <td className="px-4 py-2.5 font-mono text-[var(--text-muted)] truncate max-w-[200px]">
                            {c.ports || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DockerPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<'containers' | 'compose' | 'overview'>('containers')

  const [dockerStatus, setDockerStatus] = useState<DockerStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [containersLoading, setContainersLoading] = useState(true)
  const [containersError, setContainersError] = useState<string | null>(null)

  // Per-container action loading: name -> action string
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  // Name of container awaiting delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [deployOpen, setDeployOpen] = useState(false)
  const [logsContainer, setLogsContainer] = useState<DockerContainer | null>(null)

  const [toasts, setToasts] = useState<Toast[]>([])
  const toastTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const pushToast = (message: string, type: 'success' | 'error') => {
    const id = ++toastCounter
    setToasts((prev) => [...prev, { id, message, type }])
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      toastTimers.current.delete(id)
    }, 3500)
    toastTimers.current.set(id, timer)
  }

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get<DockerStatus>('/api/docker/status')
      setDockerStatus(data)
    } catch {
      setDockerStatus({ available: false })
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const fetchContainers = useCallback(async () => {
    try {
      const data = await api.get<DockerContainer[]>('/api/docker')
      setContainers(data)
      setContainersError(null)
    } catch (err) {
      setContainersError(err instanceof ApiError ? err.message : 'Błąd połączenia')
    } finally {
      setContainersLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchStatus()
    fetchContainers()
  }, [fetchStatus, fetchContainers])

  // Auto-refresh every 10s
  useEffect(() => {
    refreshTimer.current = setInterval(fetchContainers, 10_000)
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
  }, [fetchContainers])

  // Cleanup toast timers on unmount
  useEffect(() => {
    return () => {
      toastTimers.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  const handleAction = async (
    name: string,
    action: 'start' | 'stop' | 'restart'
  ) => {
    setActionLoading((prev) => ({ ...prev, [name]: action }))
    const labels: Record<string, string> = {
      start: 'uruchomiony',
      stop: 'zatrzymany',
      restart: 'zrestartowany',
    }
    try {
      await api.post(`/api/docker/${name}/${action}`)
      await fetchContainers()
      pushToast(`Kontener ${labels[action]}`, 'success')
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : `Błąd akcji: ${action}`, 'error')
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleDelete = async (name: string) => {
    setDeleteConfirm(null)
    setActionLoading((prev) => ({ ...prev, [name]: 'delete' }))
    try {
      await api.delete(`/api/docker/${name}`)
      await fetchContainers()
      pushToast('Kontener usunięty', 'success')
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Błąd podczas usuwania', 'error')
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const rebuild = async (name: string) => {
    setActionLoading((prev) => ({ ...prev, [name]: 'rebuild' }))
    try {
      await api.post(`/api/docker/${name}/rebuild`, {})
      setTimeout(fetchContainers, 5000)
      pushToast('Przebudowywanie kontenera...', 'success')
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Błąd przebudowania', 'error')
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const running = containers.filter((c) => c.liveStatus === 'running').length
  const stopped = containers.filter((c) => c.liveStatus !== 'running').length

  return (
    <div className="min-h-screen">
      <Topbar title="Docker" subtitle="Zarządzaj kontenerami Docker" />

      <div className="p-6 space-y-5">
        {/* ── Tab switcher ── */}
        <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 w-fit">
          {(
            [
              { key: 'containers' as const, label: 'Kontenery' },
              { key: 'compose' as const, label: 'Docker Compose' },
              ...(isAdmin ? [{ key: 'overview' as const, label: 'Przeglad' }] : []),
            ] as Array<{ key: typeof tab; label: string }>
          ).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && isAdmin && <OverviewTab />}
        {tab === 'compose' && <ComposeTab />}

        {tab === 'containers' && <>
        {/* ── Docker not available warning ── */}
        {!statusLoading && dockerStatus && !dockerStatus.available && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-yellow-500/8 border border-yellow-500/20">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-yellow-300">
                Docker nie jest zainstalowany
              </p>
              <p className="text-xs text-yellow-300/60 mt-0.5">
                Zainstaluj Docker Engine na serwerze, aby móc zarządzać kontenerami.
              </p>
            </div>
          </div>
        )}

        {/* ── Top row: docker version pill + buttons ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {statusLoading ? (
              <div className="w-36 h-7 rounded-lg bg-white/5 animate-pulse" />
            ) : dockerStatus?.available ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.7)]" />
                <span className="text-xs font-medium text-[var(--text-secondary)]">Docker</span>
                {dockerStatus.version && (
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {dockerStatus.version}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-xs font-medium text-red-400">Niedostępny</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchContainers}
              disabled={containersLoading}
            >
              <RefreshCw className={`w-4 h-4 ${containersLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="sm"
              onClick={() => setDeployOpen(true)}
              disabled={!dockerStatus?.available}
            >
              <Plus className="w-4 h-4" />
              Wdróż kontener
            </Button>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
              Łącznie
            </p>
            {containersLoading ? (
              <div className="w-10 h-7 rounded-lg bg-white/5 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold gradient-brand-text">{containers.length}</p>
            )}
            <p className="text-xs text-[var(--text-muted)] mt-1">kontenerów</p>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
              Aktywne
            </p>
            {containersLoading ? (
              <div className="w-10 h-7 rounded-lg bg-white/5 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-green-400">{running}</p>
            )}
            <p className="text-xs text-[var(--text-muted)] mt-1">uruchomione</p>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
              Zatrzymane
            </p>
            {containersLoading ? (
              <div className="w-10 h-7 rounded-lg bg-white/5 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-[var(--text-secondary)]">{stopped}</p>
            )}
            <p className="text-xs text-[var(--text-muted)] mt-1">nieaktywne</p>
          </Card>
        </div>

        {/* ── Container list ── */}

        {/* Loading skeleton */}
        {containersLoading && containers.length === 0 && (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
            <span className="ml-2 text-sm text-[var(--text-muted)]">Ładowanie kontenerów...</span>
          </div>
        )}

        {/* Error */}
        {!containersLoading && containersError && (
          <Card className="p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <XCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm font-medium text-red-400">Nie można załadować kontenerów</p>
              <p className="text-xs text-[var(--text-muted)]">{containersError}</p>
              <Button variant="secondary" size="sm" onClick={fetchContainers} className="mt-2">
                <RefreshCw className="w-4 h-4" /> Spróbuj ponownie
              </Button>
            </div>
          </Card>
        )}

        {/* Empty state */}
        {!containersLoading && !containersError && containers.length === 0 && (
          <Card>
            <EmptyState
              icon={Container}
              title="Brak kontenerów"
              description="Wdróż pierwszy kontener korzystając z gotowych szablonów lub własnego obrazu Docker"
              action={{ label: 'Wdróż kontener', onClick: () => setDeployOpen(true) }}
            />
          </Card>
        )}

        {/* Container cards */}
        {containers.length > 0 && (
          <div className="space-y-3">
            {containers.map((container) => {
              const isActing = !!actionLoading[container.name]
              const actingType = actionLoading[container.name]
              const isRunning = container.liveStatus === 'running'
              const isConfirmingDelete = deleteConfirm === container.name

              return (
                <Card
                  key={container.id}
                  className="p-4 hover:border-white/20 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Left: status + info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-[5px] flex-shrink-0">
                        <StatusDot container={container} />
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Name row */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {container.displayName}
                          </p>
                          <StatusBadge container={container} />
                          {container.template && (
                            <Badge variant="brand">{container.template}</Badge>
                          )}
                        </div>
                        {/* Image */}
                        <p className="text-xs text-[var(--text-muted)] font-mono truncate mb-1">
                          {container.image}
                        </p>
                        {/* Meta: domain, ports, live text */}
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                          {container.domain && (
                            <a
                              href={`https://${container.domain}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {container.domain}
                            </a>
                          )}
                          {container.ports && (
                            <span className="text-xs text-[var(--text-muted)] font-mono">
                              {container.ports}
                            </span>
                          )}
                          {!container.ports && container.externalPort && (
                            <span className="text-xs text-[var(--text-muted)] font-mono">
                              :{container.externalPort}
                            </span>
                          )}
                          {container.liveStatusText && (
                            <span className="text-xs text-[var(--text-muted)]/60">
                              {container.liveStatusText}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap sm:flex-nowrap">
                      {isConfirmingDelete ? (
                        <>
                          <span className="text-xs text-red-400 mr-1">Usunąć?</span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(container.name)}
                            loading={actingType === 'delete'}
                            className="h-8 px-3"
                          >
                            Tak, usuń
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDeleteConfirm(null)}
                            className="h-8 px-3"
                          >
                            Anuluj
                          </Button>
                        </>
                      ) : (
                        <>
                          {/* Start / Stop */}
                          {isRunning ? (
                            <button
                              title="Zatrzymaj"
                              disabled={isActing}
                              onClick={() => handleAction(container.name, 'stop')}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-yellow-400 hover:bg-yellow-400/10 border border-transparent hover:border-yellow-400/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {actingType === 'stop' ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Square className="w-3.5 h-3.5" />
                              )}
                            </button>
                          ) : (
                            <button
                              title="Uruchom"
                              disabled={isActing}
                              onClick={() => handleAction(container.name, 'start')}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-green-400 hover:bg-green-400/10 border border-transparent hover:border-green-400/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {actingType === 'start' ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          {/* Restart */}
                          <button
                            title="Restartuj"
                            disabled={isActing || !isRunning}
                            onClick={() => handleAction(container.name, 'restart')}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-blue-400 hover:bg-blue-400/10 border border-transparent hover:border-blue-400/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {actingType === 'restart' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Logs */}
                          <button
                            title="Logi"
                            onClick={() => setLogsContainer(container)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 border border-transparent hover:border-[var(--primary)]/20 transition-all"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </button>

                          {/* Rebuild */}
                          <button
                            title="Przebuduj (pull latest)"
                            disabled={isActing}
                            onClick={() => rebuild(container.name)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-blue-400 hover:bg-blue-400/10 border border-transparent hover:border-blue-400/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {actingType === 'rebuild' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Delete */}
                          <button
                            title="Usuń"
                            disabled={isActing}
                            onClick={() => setDeleteConfirm(container.name)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 border border-transparent hover:border-red-400/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        </>}
      </div>

      {/* ── Modals ── */}
      <DeployModal
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        onDeployed={() => {
          fetchContainers()
          pushToast('Kontener wdrożony pomyślnie', 'success')
        }}
      />

      <LogsModal container={logsContainer} onClose={() => setLogsContainer(null)} />

      {/* ── Toast notifications ── */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-300 ${
              toast.type === 'success'
                ? 'bg-green-500/10 border-green-500/25 text-green-300 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
                : 'bg-red-500/10 border-red-500/25 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}
