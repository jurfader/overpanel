'use client'

import { useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Reply, ReplyAll, Forward, Trash2, Flag,
  ArrowLeft, Paperclip, Download,
} from 'lucide-react'

interface EmailAddress {
  name?: string
  email: string
}

interface Attachment {
  blobId: string
  name: string
  type: string
  size: number
}

export interface FullMessage {
  id: string
  from: EmailAddress[]
  to: EmailAddress[]
  cc?: EmailAddress[]
  bcc?: EmailAddress[]
  subject: string
  receivedAt: string
  isRead: boolean
  isFlagged: boolean
  htmlBody?: string
  textBody?: string
  attachments?: Attachment[]
}

interface MessageViewProps {
  message: FullMessage
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
  onDelete: () => void
  onFlag: () => void
  onBack: () => void
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatAddress(addr: EmailAddress): string {
  if (addr.name) return `${addr.name} <${addr.email}>`
  return addr.email
}

function formatAddressList(addrs: EmailAddress[]): string {
  return addrs.map(formatAddress).join(', ')
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MessageView({
  message,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  onFlag,
  onBack,
}: MessageViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Render HTML content in iframe
  useEffect(() => {
    if (!iframeRef.current) return
    const doc = iframeRef.current.contentDocument
    if (!doc) return

    const htmlContent = message.htmlBody || `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escapeHtml(message.textBody || '')}</pre>`

    doc.open()
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #e0e0e0;
    background: transparent;
    margin: 0;
    padding: 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  a { color: #E91E8C; }
  img { max-width: 100%; height: auto; }
  pre { white-space: pre-wrap; }
  blockquote {
    border-left: 3px solid rgba(255,255,255,0.1);
    margin: 8px 0;
    padding: 4px 12px;
    color: #888;
  }
  table { max-width: 100%; }
</style>
</head>
<body>${htmlContent}</body>
</html>`)
    doc.close()
  }, [message.htmlBody, message.textBody])

  const hasAttachments = message.attachments && message.attachments.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onReply} title="Odpowiedz">
          <Reply className="w-4 h-4" />
          <span className="hidden lg:inline text-xs">Odpowiedz</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onReplyAll} title="Odpowiedz wszystkim">
          <ReplyAll className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onForward} title="Przekaz dalej">
          <Forward className="w-4 h-4" />
          <span className="hidden lg:inline text-xs">Przekaz</span>
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onFlag}
          className={message.isFlagged ? 'text-yellow-400' : ''}
          title={message.isFlagged ? 'Usun flage' : 'Oznacz flaga'}
        >
          <Flag className="w-4 h-4" fill={message.isFlagged ? 'currentColor' : 'none'} />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} title="Usun" className="text-red-400 hover:text-red-300">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Message header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex-shrink-0 space-y-2">
        <h2 className="text-base font-semibold text-[var(--text-primary)] leading-snug">
          {message.subject || '(Brak tematu)'}
        </h2>
        <div className="space-y-1">
          <div className="flex items-start gap-2 text-xs">
            <span className="text-[var(--text-muted)] w-10 flex-shrink-0 pt-0.5">Od:</span>
            <span className="text-[var(--text-primary)]">{formatAddressList(message.from)}</span>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <span className="text-[var(--text-muted)] w-10 flex-shrink-0 pt-0.5">Do:</span>
            <span className="text-[var(--text-secondary)]">{formatAddressList(message.to)}</span>
          </div>
          {message.cc && message.cc.length > 0 && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-[var(--text-muted)] w-10 flex-shrink-0 pt-0.5">CC:</span>
              <span className="text-[var(--text-secondary)]">{formatAddressList(message.cc)}</span>
            </div>
          )}
          <div className="flex items-start gap-2 text-xs">
            <span className="text-[var(--text-muted)] w-10 flex-shrink-0 pt-0.5">Data:</span>
            <span className="text-[var(--text-muted)]">{formatFullDate(message.receivedAt)}</span>
          </div>
        </div>
      </div>

      {/* Attachments */}
      {hasAttachments && (
        <div className="px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Paperclip className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-muted)]">
              {message.attachments!.length} {message.attachments!.length === 1 ? 'zalacznik' : 'zalacznikow'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {message.attachments!.map((att) => (
              <div
                key={att.blobId}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3 text-[var(--text-muted)]" />
                <span className="text-[var(--text-secondary)] truncate max-w-[150px]">{att.name}</span>
                <span className="text-[var(--text-muted)]">{formatFileSize(att.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message body */}
      <div className="flex-1 min-h-0">
        <iframe
          ref={iframeRef}
          className="w-full h-full border-0"
          sandbox="allow-same-origin"
          title="Tresc wiadomosci"
          style={{ background: 'transparent' }}
        />
      </div>
    </div>
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
