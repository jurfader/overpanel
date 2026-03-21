'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { useApi } from '@/hooks/use-api'
import { api } from '@/lib/api'
import { ConnectModal } from '@/components/webmail/connect-modal'
import {
  Inbox, Mail, LogIn, LogOut, RefreshCw, CheckCircle2, XCircle,
} from 'lucide-react'

interface MailboxRecord {
  id: string
  address: string
  localPart: string
  displayName: string | null
  isActive: boolean
  domain: { domain: string }
}

interface SessionInfo {
  active: boolean
  mailbox: string
}

export default function WebmailConnectPage() {
  const router = useRouter()
  const { data: mailboxes, loading: mailboxesLoading, refetch } = useApi<MailboxRecord[]>('/api/mail/mailboxes')
  const [sessions, setSessions] = useState<Record<string, boolean>>({})
  const [checkingSessions, setCheckingSessions] = useState(true)
  const [connectMailbox, setConnectMailbox] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const mailboxList = mailboxes ?? []

  // Check active sessions for all mailboxes
  useEffect(() => {
    if (!mailboxes || mailboxes.length === 0) {
      setCheckingSessions(false)
      return
    }
    setCheckingSessions(true)
    Promise.allSettled(
      mailboxes.map((m) =>
        api.get<SessionInfo>(`/api/webmail/session?mailbox=${encodeURIComponent(m.address)}`)
          .then((s) => ({ address: m.address, active: s.active }))
          .catch(() => ({ address: m.address, active: false }))
      )
    ).then((results) => {
      const map: Record<string, boolean> = {}
      for (const r of results) {
        if (r.status === 'fulfilled') {
          map[r.value.address] = r.value.active
        }
      }
      setSessions(map)
      setCheckingSessions(false)
    })
  }, [mailboxes])

  const handleConnectSuccess = (address: string) => {
    setConnectMailbox(null)
    router.push(`/webmail/${encodeURIComponent(address)}`)
  }

  const handleDisconnect = async (address: string) => {
    setDisconnecting(address)
    try {
      await api.post('/api/webmail/disconnect', { mailboxAddress: address })
      setSessions((prev) => ({ ...prev, [address]: false }))
    } catch (err) {
      console.error('Failed to disconnect', err)
    } finally {
      setDisconnecting(null)
    }
  }

  const handleOpenMailbox = (address: string) => {
    router.push(`/webmail/${encodeURIComponent(address)}`)
  }

  return (
    <div className="min-h-screen">
      <Topbar title="Webmail" subtitle={`${mailboxList.length} skrzynek`} />

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
              <Inbox className="w-4 h-4 text-[var(--primary)]" />
            </div>
            <CardTitle>Skrzynki pocztowe</CardTitle>
            <div className="ml-auto">
              <Button variant="secondary" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {mailboxesLoading || checkingSessions ? (
              <div className="flex items-center justify-center py-12">
                <svg className="animate-spin h-6 w-6 text-[var(--primary)]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : mailboxList.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="Brak skrzynek pocztowych"
                description="Utwórz skrzynke w sekcji Poczta e-mail, aby korzystac z webmaila"
              />
            ) : (
              <div className="space-y-2">
                {mailboxList.map((m) => {
                  const isActive = sessions[m.address] ?? false
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                        <Mail className="w-5 h-5 text-[var(--text-secondary)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {m.address}
                        </p>
                        {m.displayName && (
                          <p className="text-xs text-[var(--text-muted)] truncate">{m.displayName}</p>
                        )}
                      </div>
                      <Badge variant={isActive ? 'success' : 'neutral'}>
                        {isActive ? (
                          <><CheckCircle2 className="w-3 h-3" /> Polaczono</>
                        ) : (
                          <><XCircle className="w-3 h-3" /> Rozlaczono</>
                        )}
                      </Badge>
                      <div className="flex items-center gap-2">
                        {isActive ? (
                          <>
                            <Button size="sm" onClick={() => handleOpenMailbox(m.address)}>
                              <Inbox className="w-4 h-4" /> Otwórz
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleDisconnect(m.address)}
                              loading={disconnecting === m.address}
                              title="Rozlacz"
                            >
                              <LogOut className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => setConnectMailbox(m.address)}>
                            <LogIn className="w-4 h-4" /> Polacz
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Connect modal */}
      {connectMailbox && (
        <ConnectModal
          open={!!connectMailbox}
          mailbox={connectMailbox}
          onClose={() => setConnectMailbox(null)}
          onSuccess={() => handleConnectSuccess(connectMailbox)}
        />
      )}
    </div>
  )
}
