'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SiteRow } from '@/components/sites/site-row'
import { CreateSiteModal } from '@/components/sites/create-site-modal'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/store/auth'
import type { Site } from '@overpanel/shared'
import { Globe, Plus, Search, RefreshCw } from 'lucide-react'

type SiteWithUser = Site & { user?: { name: string }; _count?: { databases: number } }

export default function SitesPage() {
  const user = useAuthStore((s) => s.user)
  const { data, loading, error, refetch } = useApi<SiteWithUser[]>('/api/sites')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')

  const sites = data ?? []
  const filtered = sites.filter((s) =>
    s.domain.toLowerCase().includes(search.toLowerCase())
  )

  const stats = {
    total: sites.length,
    active: sites.filter((s) => s.status === 'active').length,
    ssl: sites.filter((s) => s.hasSSL).length,
    wordpress: sites.filter((s) => s.hasWordpress).length,
  }

  return (
    <div className="min-h-screen">
      <Topbar title="Strony WWW" subtitle={`${stats.total} stron · ${stats.active} aktywnych`} />

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Wszystkich', value: stats.total, color: 'text-[var(--primary)]' },
            { label: 'Aktywnych', value: stats.active, color: 'text-green-400' },
            { label: 'Z SSL', value: stats.ssl, color: 'text-blue-400' },
            { label: 'WordPress', value: stats.wordpress, color: 'text-orange-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="glass rounded-xl p-4 border border-white/[0.06]">
              <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
              <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Szukaj domeny..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={refetch}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            Nowa strona
          </Button>
        </div>

        {/* Content */}
        <Card className="p-0 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.06] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            <span className="w-2.5" />
            <span className="flex-1">Domena</span>
            <span className="hidden md:block w-48">Status</span>
            <span className="hidden xl:block w-32">SSL wygasa</span>
            <span className="w-20" />
          </div>

          {loading && (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="py-8 text-center text-sm text-red-400">{error}</div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <EmptyState
              icon={Globe}
              title="Brak stron"
              description={search ? 'Brak wyników dla podanej frazy' : 'Dodaj pierwszą stronę WWW do hostowania'}
              action={!search ? { label: 'Dodaj stronę', onClick: () => setShowCreate(true) } : undefined}
            />
          )}

          {!loading && !error && filtered.map((site) => (
            <div key={site.id} className="border-b border-white/[0.04] last:border-0">
              <SiteRow site={site} isAdmin={user?.role === 'admin'} onRefetch={refetch} />
            </div>
          ))}
        </Card>
      </div>

      <CreateSiteModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={refetch}
      />
    </div>
  )
}
