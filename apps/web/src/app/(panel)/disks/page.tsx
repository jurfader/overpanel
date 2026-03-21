'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { useApi } from '@/hooks/use-api'
import { api } from '@/lib/api'
import { formatBytes } from '@/lib/utils'
import {
  Disc3,
  RefreshCw,
  HardDrive,
  Play,
  Square,
  Wrench,
  BookmarkPlus,
  BookmarkMinus,
  Server,
  Database,
  FolderOpen,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────────────

interface BlockDevice {
  name: string
  size: number
  type: string
  fstype: string | null
  mountpoint: string | null
  model: string | null
  children?: BlockDevice[]
}

interface LsblkResponse {
  blockdevices: BlockDevice[]
}

interface DiskUsage {
  device: string
  fstype: string
  size: string
  used: string
  avail: string
  usePercent: number
  mountpoint: string
}

// ── Format Modal ────────────────────────────────────────────────────────────────

function FormatModal({
  partition,
  onClose,
  onSuccess,
}: {
  partition: BlockDevice
  onClose: () => void
  onSuccess: () => void
}) {
  const [fstype, setFstype] = useState<'ext4' | 'xfs'>('ext4')
  const [confirmName, setConfirmName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleFormat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (confirmName !== partition.name) {
      setError('Wpisz poprawna nazwe partycji aby potwierdzic')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post('/api/disks/format', { partition: partition.name, fstype })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blad formatowania')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Formatuj partycje" description={`Formatowanie /dev/${partition.name}`} size="sm">
      <form onSubmit={handleFormat} className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          UWAGA: Formatowanie usunie wszystkie dane z partycji /dev/{partition.name}!
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
            System plikow
          </label>
          <div className="flex gap-2">
            {(['ext4', 'xfs'] as const).map((fs) => (
              <button
                key={fs}
                type="button"
                onClick={() => setFstype(fs)}
                className={`flex-1 h-10 rounded-xl text-sm font-medium transition-all ${
                  fstype === fs
                    ? 'gradient-brand text-white shadow-[0_0_15px_rgba(233,30,140,0.3)]'
                    : 'glass text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {fs.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <Input
          label={`Wpisz "${partition.name}" aby potwierdzic`}
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={partition.name}
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-9 rounded-xl text-sm font-medium glass text-[var(--text-secondary)] border border-white/10 hover:text-[var(--text-primary)] transition-all"
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={loading || confirmName !== partition.name}
            className="flex-1 h-9 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Formatowanie...' : 'Formatuj'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Mount Modal ─────────────────────────────────────────────────────────────────

function MountModal({
  partition,
  onClose,
  onSuccess,
}: {
  partition: BlockDevice
  onClose: () => void
  onSuccess: () => void
}) {
  const [mountpoint, setMountpoint] = useState(`/mnt/${partition.name}`)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleMount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mountpoint.startsWith('/mnt/')) {
      setError('Punkt montowania musi byc w /mnt/')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post('/api/disks/mount', { partition: partition.name, mountpoint })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blad montowania')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Zamontuj partycje" description={`Montowanie /dev/${partition.name}`} size="sm">
      <form onSubmit={handleMount} className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <Input
          label="Punkt montowania"
          value={mountpoint}
          onChange={(e) => setMountpoint(e.target.value)}
          placeholder="/mnt/data"
          icon={<FolderOpen className="w-4 h-4" />}
        />

        <div className="px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
          Katalog zostanie automatycznie utworzony jesli nie istnieje.
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-9 rounded-xl text-sm font-medium glass text-[var(--text-secondary)] border border-white/10 hover:text-[var(--text-primary)] transition-all"
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={loading || !mountpoint.startsWith('/mnt/')}
            className="flex-1 h-9 rounded-xl text-sm font-medium gradient-brand text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Montowanie...' : 'Zamontuj'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Partition Bar ───────────────────────────────────────────────────────────────

function PartitionBar({ disk, usageMap }: { disk: BlockDevice; usageMap: Map<string, DiskUsage> }) {
  const children = disk.children ?? []
  const totalSize = disk.size || 1

  // Calculate used space across partitions
  const partitionsTotalSize = children.reduce((sum, p) => sum + (p.size || 0), 0)
  const freeSpace = Math.max(0, totalSize - partitionsTotalSize)

  if (children.length === 0) {
    return (
      <div className="w-full h-6 rounded-lg overflow-hidden bg-white/5 border border-white/10">
        <div className="h-full w-full bg-white/10 flex items-center justify-center">
          <span className="text-[10px] text-[var(--text-muted)]">Brak partycji</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-6 rounded-lg overflow-hidden bg-white/5 border border-white/10 flex">
      {children.map((part) => {
        const widthPct = Math.max(2, (part.size / totalSize) * 100)
        const usage = usageMap.get(`/dev/${part.name}`)
        const usePct = usage?.usePercent ?? 0

        let bgColor = 'bg-emerald-500/60'
        if (usePct >= 80) bgColor = 'bg-red-500/60'
        else if (usePct >= 60) bgColor = 'bg-yellow-500/60'

        // Unmounted partitions get a neutral color
        if (!part.mountpoint) bgColor = 'bg-blue-500/40'

        return (
          <div
            key={part.name}
            className={`h-full ${bgColor} border-r border-white/10 last:border-r-0 flex items-center justify-center transition-all hover:brightness-125 cursor-default`}
            style={{ width: `${widthPct}%` }}
            title={`${part.name} — ${formatBytes(part.size)}${usage ? ` (${usePct}% zajete)` : ''}`}
          >
            {widthPct > 8 && (
              <span className="text-[9px] font-medium text-white/80 truncate px-1">
                {part.name}
              </span>
            )}
          </div>
        )
      })}
      {freeSpace > 0 && (
        <div
          className="h-full bg-white/5 flex items-center justify-center"
          style={{ width: `${Math.max(2, (freeSpace / totalSize) * 100)}%` }}
          title={`Wolne: ${formatBytes(freeSpace)}`}
        >
          {(freeSpace / totalSize) * 100 > 10 && (
            <span className="text-[9px] text-[var(--text-muted)] truncate px-1">wolne</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────────

export default function DisksPage() {
  const { data: lsblkData, loading: loadingDisks, refetch: refetchDisks } = useApi<LsblkResponse>('/api/disks')
  const { data: usageData, loading: loadingUsage, refetch: refetchUsage } = useApi<DiskUsage[]>('/api/disks/usage')

  const [formatTarget, setFormatTarget] = useState<BlockDevice | null>(null)
  const [mountTarget, setMountTarget] = useState<BlockDevice | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loading = loadingDisks || loadingUsage

  const disks = (lsblkData?.blockdevices ?? []).filter((d) => d.type === 'disk')
  const usage = usageData ?? []

  // Build a map from device path to usage
  const usageMap = new Map<string, DiskUsage>()
  for (const u of usage) {
    usageMap.set(u.device, u)
  }

  // Summary stats
  const totalSpace = disks.reduce((sum, d) => sum + (d.size || 0), 0)
  const totalPartitions = disks.reduce((sum, d) => sum + (d.children?.length ?? 0), 0)
  const mountedPartitions = disks.reduce(
    (sum, d) => sum + (d.children?.filter((p) => p.mountpoint).length ?? 0),
    0
  )

  const refetch = () => {
    refetchDisks()
    refetchUsage()
  }

  const handleUnmount = async (mountpoint: string) => {
    if (!confirm(`Odmontowac ${mountpoint}?`)) return
    setActionLoading(mountpoint)
    try {
      await api.post('/api/disks/unmount', { mountpoint })
      refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Blad odmontowywania')
    } finally {
      setActionLoading(null)
    }
  }

  const handleFstabAdd = async (partition: BlockDevice) => {
    if (!partition.mountpoint || !partition.fstype) return
    setActionLoading(`fstab-add-${partition.name}`)
    try {
      await api.post('/api/disks/fstab', {
        partition: partition.name,
        mountpoint: partition.mountpoint,
        fstype: partition.fstype,
      })
      alert(`Dodano /dev/${partition.name} do fstab`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Blad dodawania do fstab')
    } finally {
      setActionLoading(null)
    }
  }

  const handleFstabRemove = async (mountpoint: string) => {
    if (!confirm(`Usunac wpis fstab dla ${mountpoint}?`)) return
    setActionLoading(`fstab-rm-${mountpoint}`)
    try {
      await api.delete('/api/disks/fstab')
      // The API expects body on DELETE — use post-style workaround
      await fetch('/api/disks/fstab', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mountpoint }),
      })
      alert(`Usunieto wpis fstab dla ${mountpoint}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Blad usuwania z fstab')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="min-h-screen">
      <Topbar title="Dyski" subtitle="Zarzadzaj dyskami i partycjami" />

      <div className="p-6 space-y-5">
        {/* ── Summary cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
              <HardDrive className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">Dyski</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">{disks.length}</p>
            </div>
          </Card>

          <Card className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Server className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">Calkowita przestrzen</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">{formatBytes(totalSpace)}</p>
            </div>
          </Card>

          <Card className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">Zamontowane partycje</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">
                {mountedPartitions} / {totalPartitions}
              </p>
            </div>
          </Card>
        </div>

        {/* ── Refresh ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end">
          <Button variant="secondary" size="sm" onClick={refetch}>
            <RefreshCw className="w-4 h-4" /> Odswiez
          </Button>
        </div>

        {/* ── Loading ────────────────────────────────────────────────────── */}
        {loading && (
          <div className="py-12 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {!loading && disks.length === 0 && (
          <Card>
            <EmptyState
              icon={Disc3}
              title="Brak dyskow"
              description="Nie znaleziono zadnych urzadzen blokowych"
            />
          </Card>
        )}

        {/* ── Disk cards ─────────────────────────────────────────────────── */}
        {!loading &&
          disks.map((disk) => {
            const children = disk.children ?? []

            return (
              <Card key={disk.name} className="space-y-4">
                {/* Disk header */}
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <Disc3 className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        /dev/{disk.name}
                      </h3>
                      {disk.model && (
                        <Badge variant="neutral">{disk.model.trim()}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {formatBytes(disk.size)} &middot; {children.length} partycji
                    </p>
                  </div>
                </div>

                {/* Partition bar */}
                <PartitionBar disk={disk} usageMap={usageMap} />

                {/* Partition list */}
                {children.length > 0 && (
                  <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                    {/* Table header */}
                    <div className="flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.06] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest bg-white/[0.02]">
                      <span className="w-28">Partycja</span>
                      <span className="w-20">Rozmiar</span>
                      <span className="w-16">FS</span>
                      <span className="flex-1">Punkt montowania</span>
                      <span className="w-20 text-right">Uzycie</span>
                      <span className="w-36" />
                    </div>

                    {children.map((part) => {
                      const partUsage = usageMap.get(`/dev/${part.name}`)
                      const usePct = partUsage?.usePercent ?? 0
                      const isMounted = !!part.mountpoint

                      let usageColor = 'text-emerald-400'
                      let usageBg = 'bg-emerald-500/20'
                      if (usePct >= 80) {
                        usageColor = 'text-red-400'
                        usageBg = 'bg-red-500/20'
                      } else if (usePct >= 60) {
                        usageColor = 'text-yellow-400'
                        usageBg = 'bg-yellow-500/20'
                      }

                      return (
                        <div
                          key={part.name}
                          className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] group transition-colors"
                        >
                          {/* Name */}
                          <div className="w-28">
                            <span className="text-sm font-mono font-medium text-[var(--text-primary)]">
                              {part.name}
                            </span>
                          </div>

                          {/* Size */}
                          <div className="w-20 text-sm text-[var(--text-secondary)]">
                            {formatBytes(part.size)}
                          </div>

                          {/* FS type */}
                          <div className="w-16">
                            {part.fstype ? (
                              <Badge variant="info">{part.fstype}</Badge>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">--</span>
                            )}
                          </div>

                          {/* Mountpoint */}
                          <div className="flex-1 min-w-0">
                            {part.mountpoint ? (
                              <span className="text-sm text-[var(--text-secondary)] font-mono truncate block">
                                {part.mountpoint}
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">Nie zamontowana</span>
                            )}
                          </div>

                          {/* Usage */}
                          <div className="w-20 text-right">
                            {isMounted && partUsage ? (
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${usageBg.replace('/20', '/60')}`}
                                    style={{ width: `${usePct}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-medium ${usageColor}`}>
                                  {usePct}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">--</span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="w-36 flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setFormatTarget(part)}
                              title="Formatuj"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                            </Button>

                            {isMounted ? (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleUnmount(part.mountpoint!)}
                                loading={actionLoading === part.mountpoint}
                                title="Odmontuj"
                              >
                                <Square className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setMountTarget(part)}
                                title="Zamontuj"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </Button>
                            )}

                            {isMounted && part.mountpoint?.startsWith('/mnt/') && (
                              <>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleFstabAdd(part)}
                                  loading={actionLoading === `fstab-add-${part.name}`}
                                  title="Dodaj do fstab"
                                >
                                  <BookmarkPlus className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleFstabRemove(part.mountpoint!)}
                                  loading={actionLoading === `fstab-rm-${part.mountpoint}`}
                                  title="Usun z fstab"
                                >
                                  <BookmarkMinus className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {children.length === 0 && (
                  <div className="text-center py-6 text-sm text-[var(--text-muted)]">
                    Ten dysk nie ma partycji
                  </div>
                )}
              </Card>
            )
          })}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {formatTarget && (
        <FormatModal
          partition={formatTarget}
          onClose={() => setFormatTarget(null)}
          onSuccess={refetch}
        />
      )}

      {mountTarget && (
        <MountModal
          partition={mountTarget}
          onClose={() => setMountTarget(null)}
          onSuccess={refetch}
        />
      )}
    </div>
  )
}
