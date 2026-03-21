'use client'

import { cn } from '@/lib/utils'
import { Paperclip, Star } from 'lucide-react'

export interface MessageSummary {
  id: string
  from: { name?: string; email: string }[]
  to: { name?: string; email: string }[]
  subject: string
  preview: string
  receivedAt: string
  isRead: boolean
  isFlagged: boolean
  hasAttachment: boolean
}

interface MessageListProps {
  messages: MessageSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleFlag: (id: string) => void
  loading: boolean
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const diffDays = Math.floor((today.getTime() - msgDay.getTime()) / 86400000)

  const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })

  if (diffDays === 0) {
    return time
  }

  if (diffDays < 7) {
    const dayNames = ['Nd', 'Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'Sb']
    return `${dayNames[date.getDay()]} ${time}`
  }

  return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getSenderName(from: { name?: string; email: string }[]): string {
  if (!from || from.length === 0) return 'Nieznany'
  const sender = from[0]
  return sender.name || sender.email
}

export function MessageList({
  messages,
  selectedId,
  onSelect,
  onToggleFlag,
  loading,
  page,
  totalPages,
  onPageChange,
}: MessageListProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-6 w-6 text-[var(--primary)]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-xs text-[var(--text-muted)]">Ladowanie wiadomosci...</p>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">Brak wiadomosci w tym folderze</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto">
        {messages.map((msg) => {
          const active = msg.id === selectedId
          return (
            <button
              key={msg.id}
              onClick={() => onSelect(msg.id)}
              className={cn(
                'w-full text-left px-4 py-3 border-b border-white/[0.04] transition-all duration-150 group',
                active
                  ? 'bg-white/[0.06] border-l-2 border-l-[var(--primary)]'
                  : 'hover:bg-white/[0.03] border-l-2 border-l-transparent',
                !msg.isRead && 'bg-white/[0.02]'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Unread dot */}
                <div className="pt-1.5 w-3 flex-shrink-0">
                  {!msg.isRead && (
                    <span className="block w-2 h-2 rounded-full gradient-brand shadow-[0_0_6px_rgba(233,30,140,0.6)]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={cn(
                        'text-sm truncate flex-1',
                        msg.isRead
                          ? 'text-[var(--text-secondary)] font-normal'
                          : 'text-[var(--text-primary)] font-semibold'
                      )}
                    >
                      {getSenderName(msg.from)}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                      {formatMessageDate(msg.receivedAt)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'text-xs truncate mb-0.5',
                      msg.isRead
                        ? 'text-[var(--text-secondary)]'
                        : 'text-[var(--text-primary)] font-medium'
                    )}
                  >
                    {msg.subject || '(Brak tematu)'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">
                    {msg.preview}
                  </p>
                </div>

                {/* Indicators */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleFlag(msg.id)
                    }}
                    className={cn(
                      'w-5 h-5 flex items-center justify-center rounded transition-colors',
                      msg.isFlagged
                        ? 'text-yellow-400'
                        : 'text-transparent group-hover:text-[var(--text-muted)]'
                    )}
                  >
                    <Star className="w-3.5 h-3.5" fill={msg.isFlagged ? 'currentColor' : 'none'} />
                  </button>
                  {msg.hasAttachment && (
                    <Paperclip className="w-3 h-3 text-[var(--text-muted)]" />
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.06]">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1"
          >
            Poprzednia
          </button>
          <span className="text-[10px] text-[var(--text-muted)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1"
          >
            Nastepna
          </button>
        </div>
      )}
    </div>
  )
}
